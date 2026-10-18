import { z } from "zod";
import { positionSchema } from "./road-geometry.ts";
const ring = z
  .array(positionSchema)
  .min(4)
  .refine(
    (r) => r[0]?.[0] === r.at(-1)?.[0] && r[0]?.[1] === r.at(-1)?.[1],
    "Polygon rings must close",
  );
export const polygonGeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).min(1) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(ring).min(1)).min(1) }),
]);
export const susceptibilityFeatureSchema = z.object({
  type: z.literal("Feature"),
  id: z.number().int().nonnegative(),
  geometry: polygonGeometrySchema,
  properties: z
    .object({
      provider: z.literal("ingemmet"),
      class: z.number().int().min(0).max(5),
      label: z.enum(["Sin clasificar", "Muy Baja", "Baja", "Media", "Alta", "Muy Alta"]),
    })
    .strict(),
});
export const warningFeatureSchema = z.object({
  type: z.literal("Feature"),
  id: z.string().min(1),
  geometry: polygonGeometrySchema,
  properties: z
    .object({
      provider: z.literal("senamhi"),
      product: z.literal("quebrada_activation"),
      rawLevel: z.enum(["Nivel 1", "Nivel 2", "Nivel 3", "Nivel 4"]),
      label: z.enum(["Blanco", "Amarillo", "Naranja", "Rojo"]),
      providerDate: z.iso.date(),
      description: z.string(),
      recommendation: z.string(),
      validFrom: z.iso.datetime().nullable(),
      validUntil: z.iso.datetime().nullable(),
      validityBasis: z.literal("bulletin_local_time_assumed_America_Lima"),
      automatedRiskUse: z.literal(false),
    })
    .strict(),
});
export const hazardCaptureSchema = z
  .object({
    schemaVersion: z.literal(1),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: z.iso.datetime(),
    susceptibility: z
      .object({
        type: z.literal("FeatureCollection"),
        features: z.array(susceptibilityFeatureSchema),
        sourceUrls: z.array(z.url()).min(1),
        sourcePublishedAt: z.null(),
        historicalEligibility: z.literal("unverified"),
        queryCoverage: z.literal("road_axis_and_catchment_sampling_points"),
      })
      .strict(),
    warnings: z
      .object({
        type: z.literal("FeatureCollection"),
        features: z.array(warningFeatureSchema),
        sourceUrls: z.array(z.url()).min(1),
        nationalFeatureCount: z.number().int().nonnegative(),
        productSemantics: z.literal("verified_against_official_map"),
      })
      .strict(),
    limitations: z.array(z.string()).min(1),
  })
  .strict();
export type HazardCapture = z.infer<typeof hazardCaptureSchema>;
export const terrainCaptureSchema = z
  .object({
    schemaVersion: z.literal(1),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: z.iso.datetime(),
    method: z.literal("area_weighted_sampled_dem_gradient"),
    source: z.literal("Open-Meteo Copernicus GLO-90"),
    sourceUrls: z.array(z.url()).min(1),
    demResolutionM: z.literal(90),
    stepDistanceM: z.literal(90),
    catchments: z
      .array(
        z
          .object({
            catchmentId: z.string().min(1),
            estimatedMeanSlopeDegrees: z.number().min(0).max(90),
            samples: z
              .array(
                z
                  .object({
                    position: positionSchema,
                    weight: z.number().positive().max(1),
                    elevationsM: z.tuple([z.number(), z.number(), z.number(), z.number()]),
                    slopeDegrees: z.number().min(0).max(90),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict()
          .refine(
            (value) =>
              Math.abs(value.samples.reduce((sum, sample) => sum + sample.weight, 0) - 1) < 1e-8,
            "Terrain sample weights must sum to one",
          )
          .refine(
            (value) =>
              Math.abs(
                value.samples.reduce(
                  (sum, sample) => sum + sample.weight * sample.slopeDegrees,
                  0,
                ) - value.estimatedMeanSlopeDegrees,
              ) < 1e-6,
            "Terrain mean must match its weighted samples",
          ),
      )
      .min(1),
    limitations: z.array(z.string()).min(1),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.catchments.map((item) => item.catchmentId)).size === value.catchments.length,
    "Duplicate terrain catchment identity",
  );
export type TerrainCapture = z.infer<typeof terrainCaptureSchema>;

export const preparedHazardsSchema = hazardCaptureSchema
  .extend({
    geometryDiagnostics: z.object({
      invalidSourcePolygons: z.number().int().nonnegative(),
      geometryPrecisionDecimals: z.literal(6),
      displaySimplificationToleranceM: z.literal(25),
      displayCorridorBufferM: z.literal(2000),
      sourceSusceptibilityPolygonCount: z.number().int().nonnegative(),
    }),
    segmentExposure: z.array(
      z
        .object({
          segmentId: z.string(),
          susceptibilityClasses: z.array(z.number().int().min(1).max(5)),
          coverageFraction: z.number().min(0).max(1),
        })
        .strict(),
    ),
    catchmentExposure: z.array(
      z
        .object({
          catchmentId: z.string(),
          classWeights: z.object({
            "1": z.number().min(0).max(1),
            "2": z.number().min(0).max(1),
            "3": z.number().min(0).max(1),
            "4": z.number().min(0).max(1),
            "5": z.number().min(0).max(1),
          }),
          unknownWeight: z.number().min(0).max(1),
          method: z.literal("area_weighted_sampling"),
          boundaryRule: z.literal("highest_class"),
        })
        .strict()
        .refine(
          (v) =>
            Math.abs(
              Object.values(v.classWeights).reduce((n, w) => n + w, 0) + v.unknownWeight - 1,
            ) < 1e-8,
          "Invalid susceptibility sample weights",
        ),
    ),
    hydrographicCrossCheck: z
      .object({
        sourceUrl: z.url(),
        capturedAt: z.iso.datetime(),
        originalPublisherVerified: z.literal(false),
        catchments: z.array(
          z
            .object({
              catchmentId: z.string(),
              coverageFraction: z.number().min(0).max(1),
              units: z.array(
                z.object({ name: z.string(), areaFraction: z.number().min(0).max(1) }).strict(),
              ),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();
export type PreparedHazards = z.infer<typeof preparedHazardsSchema>;
