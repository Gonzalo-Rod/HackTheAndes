import { z } from "zod";
import { positionSchema, type Position } from "./road-geometry.ts";

// Conservative terrestrial bounds reject DEM no-data sentinels, not just malformed JSON.
export const MIN_TERRAIN_ELEVATION_M = -500;
export const MAX_TERRAIN_ELEVATION_M = 9_000;
// Bound one enrichment run to the geometry builder's maximum segment count.
export const MAX_ELEVATION_SAMPLES = 10_000;
export const elevationValueSchema = z
  .number()
  .min(MIN_TERRAIN_ELEVATION_M)
  .max(MAX_TERRAIN_ELEVATION_M);
export const elevationDatasetSchema = z.object({
  provider: z.string().min(1),
  dataset: z.string().min(1),
  spatialResolutionM: z.number().int().positive(),
  attribution: z.string().min(1),
  documentationUrl: z.url(),
});
export const elevationSamplePointSchema = z.object({
  segmentId: z.string().min(1),
  position: positionSchema,
  distanceFromOriginKm: z.number().nonnegative(),
});
export const elevationSampleSchema = elevationSamplePointSchema.extend({
  elevationM: elevationValueSchema,
});
export const elevationSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
    samplingMethod: z.literal("segment_midpoint"),
    retrievedAt: z.iso.datetime({ offset: true }),
    source: elevationDatasetSchema,
    sourceUrls: z.array(z.url()).min(1),
    samples: z.array(elevationSampleSchema).min(1).max(MAX_ELEVATION_SAMPLES),
  })
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const [index, sample] of value.samples.entries()) {
      if (ids.has(sample.segmentId))
        context.addIssue({
          code: "custom",
          message: "Duplicate elevation segment",
          path: ["samples", index, "segmentId"],
        });
      ids.add(sample.segmentId);
    }
  });
export const elevationBatchSchema = z.object({
  values: z.array(elevationValueSchema),
  sourceUrls: z.array(z.url()),
});

export type ElevationSnapshot = z.infer<typeof elevationSnapshotSchema>;
export type ElevationSamplePoint = z.infer<typeof elevationSamplePointSchema>;
export interface ElevationRequestOptions {
  requestId?: string;
  signal?: AbortSignal;
}
export interface ElevationProvider {
  readonly source: z.infer<typeof elevationDatasetSchema>;
  fetchElevations(
    positions: readonly Position[],
    options?: ElevationRequestOptions,
  ): Promise<z.infer<typeof elevationBatchSchema>>;
}
export interface ElevationFailure {
  code:
    | "invalid_segments"
    | "mixed_geometry_revisions"
    | "duplicate_segment"
    | "zero_length_segment"
    | "invalid_snapshot"
    | "incomplete_coverage"
    | "off_road_sample";
  message: string;
}
export type ElevationResult<T> = { ok: true; value: T } | { ok: false; error: ElevationFailure };
