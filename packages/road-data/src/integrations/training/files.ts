import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { z } from "zod";
import { historicalEventsSchema } from "../../contracts/historical-events.ts";
import { catchmentSnapshotSchema } from "../../contracts/road-catchments.ts";
import { labelRegistrySchema, coverageRegistrySchema } from "../../contracts/training-labels.ts";
import {
  observationRegistrySchema,
  trainingPolicySchema,
} from "../../contracts/logistic-training.ts";
export const trainingDataDirectory = new URL("../../../data/training/", import.meta.url);
export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export async function writeJson(path: URL, value: unknown) {
  await mkdir(new URL("./", path), { recursive: true });
  const temporary = new URL(path.href + `.${randomUUID()}.tmp`);
  const contents = JSON.stringify(value, null, 2) + "\n";
  try {
    await writeFile(temporary, contents, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  return sha256(contents);
}
export async function readTrainingSources() {
  const specifications = [
    ["events", new URL("../../../data/events/pe22-events.json", import.meta.url)],
    ["catchments", new URL("../../../data/pe22/catchments.json", import.meta.url)],
    ["labels", new URL("label-review.json", trainingDataDirectory)],
    ["coverage", new URL("monitoring-coverage.json", trainingDataDirectory)],
    ["observations", new URL("as-of-features.json", trainingDataDirectory)],
    ["policy", new URL("logistic-policy.json", trainingDataDirectory)],
  ] as const;
  const documents: Record<string, unknown> = {},
    sourceHashes: Record<string, string> = {};
  for (const [name, url] of specifications) {
    const bytes = await readFile(url);
    documents[name] = JSON.parse(bytes.toString("utf8")) as unknown;
    sourceHashes[name] = sha256(bytes);
  }
  const sources = {
    events: historicalEventsSchema.parse(documents.events),
    catchments: catchmentSnapshotSchema.parse(documents.catchments),
    labels: labelRegistrySchema.parse(documents.labels),
    coverage: coverageRegistrySchema.parse(documents.coverage),
    observations: observationRegistrySchema.parse(documents.observations),
    policy: trainingPolicySchema.parse(documents.policy),
    sourceHashes,
  };
  if (sources.labels.candidateRegistrySha256 !== sourceHashes.events)
    throw new Error("Candidate registry changed; review and repin training labels first");
  for (const review of sources.labels.reviews) {
    const event = sources.events.events.find((e) => e.id === review.eventId);
    if (!event) throw new Error("Review references an unknown event");
    if (review.evidence.some((e) => !event.sourceUrls.includes(e.sourceUrl)))
      throw new Error("Review evidence must identify a captured event source");
    if (
      event.provider === "provias" &&
      review.evidence.some(
        (e) =>
          !sources.events.sources.some(
            (s) => s.sourceUrl === e.sourceUrl && s.sha256 === e.sourceSha256,
          ),
      )
    )
      throw new Error("Review workbook hash does not match the captured source");
  }
  return sources;
}
export async function readValidatedJson<T>(path: URL, schema: z.ZodType<T>) {
  return schema.parse(JSON.parse(await readFile(path, "utf8")));
}
