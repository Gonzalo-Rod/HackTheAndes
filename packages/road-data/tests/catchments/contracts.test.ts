import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { catchmentSnapshotSchema } from "../../src/contracts/road-catchments.ts";
const snapshot = JSON.parse(
  await readFile(new URL("../../data/pe22/catchments.json", import.meta.url), "utf8"),
) as unknown;
it("validates the sourced topology fallback and makes its limitations explicit", () => {
  const data = catchmentSnapshotSchema.parse(snapshot);
  expect(data.features.every((feature) => feature.properties.lowConfidence)).toBe(true);
  expect(data.features.every((feature) => feature.properties.meanSlopeDegrees === null)).toBe(true);
  expect(data.provenance.limitations.length).toBeGreaterThan(0);
});
it("rejects changed sampling weights and duplicate basin identities", () => {
  const data = catchmentSnapshotSchema.parse(snapshot);
  const first = data.features[0];
  if (!first) throw new Error("Missing fixture catchment");
  const corrupted = structuredClone(data);
  const sample = corrupted.features[0]?.properties.samplePoints[0];
  if (!sample) throw new Error("Missing fixture sample");
  sample.weight = 1;
  expect(catchmentSnapshotSchema.safeParse(corrupted).success).toBe(false);
  expect(catchmentSnapshotSchema.safeParse({ ...data, features: [first, first] }).success).toBe(
    false,
  );
});
