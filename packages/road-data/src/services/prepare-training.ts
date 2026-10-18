import { readFile } from "node:fs/promises";
import {
  readTrainingSources,
  writeJson,
  trainingDataDirectory,
} from "../integrations/training/files.ts";
import { reviewAudit } from "../domain/training/labels.ts";
import { assembleDataset } from "../domain/training/dataset.ts";
import { nominalFeatures } from "../domain/training/nominal-features.ts";
import { readWeatherFile } from "../integrations/open-meteo/weather-files.ts";
import { readBundledTerrain } from "../integrations/hydrobasins/model-input-files.ts";
export async function prepareTraining() {
  const sources = await readTrainingSources();
  const audit = {
    ...reviewAudit(sources.events, sources.labels, sources.catchments),
    verifiedNonEventWindows: sources.coverage.windows.length,
  };
  const result = assembleDataset(sources);
  const terrain = await readBundledTerrain();
  const weather = await Promise.all(
    [2024, 2025].map((year) =>
      readWeatherFile(
        new URL(
          `../../data/weather/previous_runs-${year}-01-01-${year}-04-30.json.gz`,
          import.meta.url,
        ),
      ),
    ),
  );
  const nominal = [];
  for (const event of sources.events.events) {
    const record = audit.records.find((r) => r.eventId === event.id);
    if (!record || record.decision !== "positive_event") continue;
    const capture = weather[event.date.startsWith("2024") ? 0 : 1];
    if (!capture) throw new Error("Missing forecast archive");
    // Fixed daily decision schedule: midnight Lima, never an invented occurrence hour.
    const decisionAt = `${event.date}T05:00:00Z`;
    for (const catchmentId of record.linkedCatchments)
      for (const horizonHours of [6, 24, 72] as const) {
        nominal.push({
          eventId: event.id,
          catchmentId,
          decisionAt,
          horizonHours,
          labelIntervalContained: record.supportedHorizonsHours.includes(horizonHours),
          ...nominalFeatures(
            capture,
            terrain,
            sources.catchments,
            catchmentId,
            decisionAt,
            horizonHours,
          ),
        });
      }
  }
  return { ...result, policy: sources.policy, audit, nominal, sourceHashes: sources.sourceHashes };
}
export async function writeLabelAudit(verify: boolean) {
  const sources = await readTrainingSources();
  const audit = reviewAudit(sources.events, sources.labels, sources.catchments);
  const value = { ...audit, verifiedNonEventWindows: sources.coverage.windows.length };
  const path = new URL("label-audit.json", trainingDataDirectory);
  if (verify) {
    if (JSON.stringify(JSON.parse(await readFile(path, "utf8"))) !== JSON.stringify(value))
      throw new Error("Label audit changed; regenerate and review it");
  } else await writeJson(path, value);
  return value;
}
