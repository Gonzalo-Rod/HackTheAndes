import { z } from "zod";
import { positionSchema, lineStringSchema, multiLineStringSchema } from "./road-geometry.ts";
const ringSchema = z
  .array(positionSchema)
  .min(4)
  .refine((ring) => {
    const first = ring[0];
    const last = ring.at(-1);
    return first && last && first[0] === last[0] && first[1] === last[1];
  }, "Catchment rings must close");
const geometrySchema = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(ringSchema).min(1)).min(1),
});
const sampleSchema = z
  .object({
    longitude: z.number().min(-180).max(180),
    latitude: z.number().min(-90).max(90),
    areaKm2: z.number().positive(),
    weight: z.number().positive().max(1),
  })
  .strict();
const crossingSchema = z
  .object({
    point: positionSchema,
    segmentIds: z.array(z.string().min(1)).min(1),
    riverSourceIndex: z.number().int().nonnegative(),
  })
  .strict();
export const catchmentFeatureSchema = z.object({
  type: z.literal("Feature"),
  id: z.string().regex(/^hydrobasins-v1c-sa12-\d+$/),
  geometry: geometrySchema,
  properties: z
    .object({
      hydrobasinId: z.number().int().positive(),
      upstreamIds: z.array(z.number().int().positive()).min(1),
      areaKm2: z.number().positive(),
      meanSlopeDegrees: z.null(),
      method: z.literal("hydrobasins"),
      lowConfidence: z.literal(true),
      samplePoints: z.array(sampleSchema).min(1).max(10_000),
      pourPoint: positionSchema,
      crossings: z.array(crossingSchema).min(1),
      segmentIds: z.array(z.string().min(1)).min(1),
    })
    .strict()
    .refine(
      (value) =>
        Math.abs(value.samplePoints.reduce((sum, item) => sum + item.weight, 0) - 1) < 1e-8,
      "Sample weights must sum to one",
    ),
});
export const catchmentSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
    preparedAt: z.iso.datetime({ offset: true }),
    type: z.literal("FeatureCollection"),
    features: z.array(catchmentFeatureSchema).min(1),
    provenance: z
      .object({
        sourceUrl: z.url(),
        licenseUrl: z.url(),
        attribution: z.string().min(1),
        archiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
        hydrographySourceUrl: z.url(),
        hydrographyRetrievedAt: z.iso.datetime({ offset: true }),
        hydrographySha256: z.string().regex(/^[a-f0-9]{64}$/),
        samplingGridDegrees: z.literal(0.1),
        limitations: z.array(z.string()).min(1),
      })
      .strict(),
    diagnostics: z.object({
      crossingCount: z.number().int().positive(),
      coarseBasinCount: z.number().int().positive(),
      linkedSegments: z.number().int().positive(),
    }),
    rivers: z.object({
      type: z.literal("FeatureCollection"),
      features: z.array(
        z.object({
          type: z.literal("Feature"),
          properties: z.object({
            sourceIndex: z.number().int().nonnegative(),
            source: z.literal("ANA via SUTRAN"),
          }),
          geometry: z.union([lineStringSchema, multiLineStringSchema]),
        }),
      ),
    }),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.features.map((feature) => feature.id)).size !== value.features.length)
      context.addIssue({ code: "custom", message: "Duplicate catchment identities" });
    if (value.diagnostics.coarseBasinCount !== value.features.length)
      context.addIssue({ code: "custom", message: "Basin count does not match features" });
    const linkedSegments = new Set(
      value.features.flatMap((feature) => feature.properties.segmentIds),
    );
    if (linkedSegments.size !== value.diagnostics.linkedSegments)
      context.addIssue({ code: "custom", message: "Segment count does not match associations" });
    const crossingKeys = new Set(
      value.features.flatMap((feature) =>
        feature.properties.crossings.map(
          (crossing) => `${crossing.riverSourceIndex}:${crossing.point.join(",")}`,
        ),
      ),
    );
    if (crossingKeys.size !== value.diagnostics.crossingCount)
      context.addIssue({
        code: "custom",
        message: "Crossing count does not match source intersections",
      });
    for (const feature of value.features) {
      const segmentIds = new Set(feature.properties.segmentIds);
      const crossingSegments = new Set(
        feature.properties.crossings.flatMap((crossing) => crossing.segmentIds),
      );
      if (
        segmentIds.size !== feature.properties.segmentIds.length ||
        segmentIds.size !== crossingSegments.size ||
        [...crossingSegments].some((identifier) => !segmentIds.has(identifier))
      )
        context.addIssue({
          code: "custom",
          message: "Crossing and catchment segment associations disagree",
        });
      if (feature.id !== `hydrobasins-v1c-sa12-${feature.properties.hydrobasinId}`)
        context.addIssue({ code: "custom", message: "Catchment identity mismatch" });
      if (new Set(feature.properties.upstreamIds).size !== feature.properties.upstreamIds.length)
        context.addIssue({ code: "custom", message: "Duplicate upstream basin" });
      if (!feature.properties.upstreamIds.includes(feature.properties.hydrobasinId))
        context.addIssue({ code: "custom", message: "Upstream set must include crossing basin" });
      const sampleArea = feature.properties.samplePoints.reduce(
        (sum, sample) => sum + sample.areaKm2,
        0,
      );
      if (Math.abs(sampleArea - feature.properties.areaKm2) / feature.properties.areaKm2 > 0.01)
        context.addIssue({ code: "custom", message: "Sampling area does not cover catchment" });
    }
  });
export type CatchmentSnapshot = z.infer<typeof catchmentSnapshotSchema>;
