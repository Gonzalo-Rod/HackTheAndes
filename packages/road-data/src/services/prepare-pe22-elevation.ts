import {
  elevationBatchSchema,
  elevationSnapshotSchema,
  type ElevationProvider,
  type ElevationRequestOptions,
  type ElevationResult,
  type ElevationSnapshot,
} from "../contracts/road-elevation.ts";
import { planElevationSamples } from "../domain/road-data/elevation-samples.ts";

export async function preparePe22Elevation({
  segments,
  provider,
  clock = () => new Date(),
  ...options
}: {
  segments: unknown;
  provider: ElevationProvider;
  clock?: () => Date;
} & ElevationRequestOptions): Promise<ElevationResult<ElevationSnapshot>> {
  const plan = planElevationSamples(segments);
  if (!plan.ok) return plan;
  const batch = elevationBatchSchema.parse(
    await provider.fetchElevations(
      plan.value.samples.map((sample) => sample.position),
      options,
    ),
  );
  if (batch.values.length !== plan.value.samples.length)
    throw new Error("Elevation provider did not return one value per sample");
  const snapshot = elevationSnapshotSchema.parse({
    schemaVersion: 1,
    geometryRevision: plan.value.geometryRevision,
    samplingMethod: "segment_midpoint",
    retrievedAt: clock().toISOString(),
    source: provider.source,
    sourceUrls: batch.sourceUrls,
    samples: plan.value.samples.map((sample, index) => ({
      ...sample,
      elevationM: batch.values[index],
    })),
  });
  return { ok: true, value: snapshot };
}
