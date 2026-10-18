import type { HistoricalEvents } from "../../contracts/historical-events.ts";
import type { CatchmentSnapshot } from "../../contracts/road-catchments.ts";
import type { CoverageRegistry, LabelRegistry } from "../../contracts/training-labels.ts";
import {
  observationRegistrySchema,
  trainingDatasetSchema,
  type TrainingDataset,
} from "../../contracts/logistic-training.ts";
import { assertReviewCoverage, labelWindow } from "./labels.ts";
const HOUR_MS = 3_600_000;
export function assembleDataset({
  events,
  labels,
  coverage,
  catchments,
  observations: input,
  sourceHashes,
}: {
  events: HistoricalEvents;
  labels: LabelRegistry;
  coverage: CoverageRegistry;
  catchments: CatchmentSnapshot;
  observations: unknown;
  sourceHashes: Record<string, string>;
}) {
  assertReviewCoverage(events, labels, catchments);
  const observations = observationRegistrySchema.parse(input);
  if (
    observations.geometryRevision !== labels.geometryRevision ||
    coverage.geometryRevision !== labels.geometryRevision
  )
    throw new Error("Training source geometry revisions differ");
  for (const window of coverage.windows)
    if (!catchments.features.some((c) => c.id === window.catchmentId))
      throw new Error("Unknown monitored catchment");
  const rows: TrainingDataset["rows"] = [],
    excluded: { id: string; reason: string }[] = [];
  const keys = new Set<string>();
  for (const observation of observations.observations) {
    const key = `${observation.catchmentId}:${Date.parse(observation.decisionAt)}:${observation.horizonHours}`;
    if (keys.has(key)) throw new Error("Duplicate decision/catchment/horizon observation");
    keys.add(key);
    const label = labelWindow(observation, events, labels, coverage, catchments);
    if (label.label === null) {
      excluded.push({ id: observation.id, reason: label.reason });
      continue;
    }
    rows.push({
      id: observation.id,
      catchmentId: observation.catchmentId,
      decisionAt: observation.decisionAt,
      validUntil: new Date(
        Date.parse(observation.decisionAt) + observation.horizonHours * HOUR_MS,
      ).toISOString(),
      horizonHours: observation.horizonHours,
      label: label.label,
      episodeId: label.episodeId,
      labelEvidenceIds: label.evidenceIds,
      features: observation.features,
      sources: observation.sources,
    });
  }
  return {
    dataset: trainingDatasetSchema.parse({
      schemaVersion: 1,
      target: labels.target,
      dataKind: "reviewed_public_sources",
      geometryRevision: labels.geometryRevision,
      sourceHashes,
      rows,
    }),
    excluded,
  };
}
