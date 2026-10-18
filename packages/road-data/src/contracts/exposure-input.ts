import { z } from "zod";
import { weatherCaptureSchema } from "./catchment-weather.ts";
import { preparedHazardsSchema } from "./spatial-inputs.ts";
import { exposureAssessmentSchema } from "./exposure.ts";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const exposureInputSchema = z
  .object({
    geometryRevision: hash,
    weather: weatherCaptureSchema,
    hazardsCapturedAt: z.iso.datetime(),
    catchmentsPreparedAt: z.iso.datetime({ offset: true }),
    susceptibilitySourceUrls: z.array(z.url()).min(1),
    susceptibility: preparedHazardsSchema.shape.catchmentExposure,
    // Classes the road itself crosses; v1 inputs were captured without them.
    segmentSusceptibility: preparedHazardsSchema.shape.segmentExposure.optional(),
    catchments: z
      .array(
        z.object({ id: z.string().min(1), segmentIds: z.array(z.string().min(1)).min(1) }).strict(),
      )
      .min(1),
    segments: z
      .array(
        z
          .object({
            segmentId: z.string().min(1),
            geometryRevision: hash,
            distanceFromOriginStartKm: z.number().nonnegative(),
            distanceFromOriginEndKm: z.number().positive(),
          })
          .strict(),
      )
      .min(1),
    sourceHashes: z
      .object({ weather: hash, hazards: hash, catchments: hash, segments: hash })
      .strict(),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.weather.kind !== "operational" ||
      v.weather.model !== "ecmwf_ifs025" ||
      v.weather.geometryRevision !== v.geometryRevision ||
      v.segments.some(
        (s) =>
          s.geometryRevision !== v.geometryRevision ||
          s.distanceFromOriginEndKm <= s.distanceFromOriginStartKm,
      )
    )
      c.addIssue({ code: "custom", message: "Exposure requires consistent operational inputs" });
    const segmentIds = new Set(v.segments.map((s) => s.segmentId));
    for (const ids of [
      v.catchments.map((c) => c.id),
      v.segments.map((s) => s.segmentId),
      v.susceptibility.map((s) => s.catchmentId),
    ])
      if (new Set(ids).size !== ids.length)
        c.addIssue({ code: "custom", message: "Duplicate input identity" });
    if (
      v.catchments.some(
        (x) =>
          new Set(x.segmentIds).size !== x.segmentIds.length ||
          x.segmentIds.some((id) => !segmentIds.has(id)),
      )
    )
      c.addIssue({ code: "custom", message: "Catchment links must reference captured segments" });
  });
export const exposureRecordSchema = z
  .object({ assessment: exposureAssessmentSchema, input: exposureInputSchema })
  .strict();
export type ExposureInput = z.infer<typeof exposureInputSchema>;
export type ExposureRecord = z.infer<typeof exposureRecordSchema>;
