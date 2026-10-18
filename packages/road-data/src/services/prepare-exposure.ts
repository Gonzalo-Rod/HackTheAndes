import { catchmentSnapshotSchema } from "../contracts/road-catchments.ts";
import { displaySegmentsSchema } from "../contracts/road-geometry.ts";
import { preparedHazardsSchema } from "../contracts/spatial-inputs.ts";
import { weatherCaptureSchema } from "../contracts/catchment-weather.ts";
import { exposureAssessmentSchema, exposurePolicySchema } from "../contracts/exposure.ts";
import { exposureInputSchema, exposureRecordSchema } from "../contracts/exposure-input.ts";
import { calculateExposure } from "../domain/exposure/assessment.ts";
import { exposureHash, exposureIdentity } from "../domain/exposure/record.ts";
import { DEFAULT_EXPOSURE_POLICY } from "../domain/exposure/policy.ts";
export function prepareExposure(
  sources: { weather: unknown; hazards: unknown; catchments: unknown; segments: unknown },
  assessedAt: string,
) {
  const weather = weatherCaptureSchema.safeParse(sources.weather);
  const hazards = preparedHazardsSchema.safeParse(sources.hazards);
  const catchments = catchmentSnapshotSchema.safeParse(sources.catchments);
  const segments = displaySegmentsSchema.safeParse(sources.segments);
  if (
    !weather.success ||
    !hazards.success ||
    !catchments.success ||
    !segments.success ||
    !exposureAssessmentSchema.shape.assessedAt.safeParse(assessedAt).success
  )
    return {
      ok: false as const,
      error: { code: "invalid_inputs" as const, message: "Exposure inputs failed validation" },
    };
  if (
    weather.data.geometryRevision !== catchments.data.geometryRevision ||
    hazards.data.geometryRevision !== catchments.data.geometryRevision
  )
    return {
      ok: false as const,
      error: { code: "revision_mismatch" as const, message: "Exposure source revisions differ" },
    };
  const input = exposureInputSchema.safeParse({
    geometryRevision: catchments.data.geometryRevision,
    weather: weather.data,
    hazardsCapturedAt: hazards.data.capturedAt,
    catchmentsPreparedAt: catchments.data.preparedAt,
    susceptibilitySourceUrls: hazards.data.susceptibility.sourceUrls,
    susceptibility: hazards.data.catchmentExposure,
    catchments: catchments.data.features.map((c) => ({
      id: c.id,
      segmentIds: c.properties.segmentIds,
    })),
    segments: segments.data.features.map((s) => ({
      segmentId: s.id,
      geometryRevision: s.properties.geometryRevision,
      distanceFromOriginStartKm: s.properties.distanceFromOriginStartKm,
      distanceFromOriginEndKm: s.properties.distanceFromOriginEndKm,
    })),
    sourceHashes: {
      weather: exposureHash(weather.data),
      hazards: exposureHash(hazards.data),
      catchments: exposureHash(catchments.data),
      segments: exposureHash(segments.data),
    },
  });
  if (
    !input.success ||
    [weather.data.capturedAt, hazards.data.capturedAt, catchments.data.preparedAt].some(
      (t) => Date.parse(t) > Date.parse(assessedAt),
    )
  )
    return {
      ok: false as const,
      error: {
        code: "inconsistent_inputs" as const,
        message: "Exposure source identities or timing are inconsistent",
      },
    };
  const policy = exposurePolicySchema.parse(DEFAULT_EXPOSURE_POLICY);
  const assessment = exposureAssessmentSchema.parse(
    calculateExposure(input.data, policy, {
      assessmentId: exposureIdentity(input.data, policy),
      policySha256: exposureHash(policy),
      assessedAt: new Date(assessedAt).toISOString(),
    }),
  );
  return {
    ok: true as const,
    value: exposureRecordSchema.parse({ assessment, input: input.data }),
  };
}
