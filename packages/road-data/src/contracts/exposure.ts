import { z } from "zod";
import { rainAggregateSchema } from "./catchment-weather.ts";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime();
export const exposureCategorySchema = z.enum(["routine", "watch", "priority", "high_attention"]);
export const exposurePolicySchema = z
  .object({
    // v1 records remain valid; v2 also requires the road itself to cross susceptible terrain.
    version: z.enum(["climate-exposure-v1", "climate-exposure-v2"]),
    interpretation: z.literal("experimental_attention_criteria_not_hazard_thresholds"),
    weatherMaxAgeMs: z.number().int().positive(),
    minimumSusceptibilityCoverage: z.number().positive().max(1),
    susceptibleAreaFraction: z.number().positive().max(1),
    antecedentRainMm72h: z.number().positive(),
    antecedentRainMm168h: z.number().positive(),
    minimumLocalSusceptibilityClass: z.number().int().min(1).max(5).optional(),
    thresholds: z
      .object({
        "6": z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
        "24": z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
        "72": z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
      })
      .strict(),
  })
  .strict()
  .superRefine((v, c) => {
    for (const values of Object.values(v.thresholds))
      if (values[0] >= values[1] || values[1] >= values[2])
        c.addIssue({ code: "custom", message: "Rainfall attention thresholds must increase" });
    if ((v.version === "climate-exposure-v2") !== (v.minimumLocalSusceptibilityClass !== undefined))
      c.addIssue({
        code: "custom",
        message: "Only v2 policies define a local susceptibility class",
      });
  });
export const exposureWindowSchema = z
  .object({
    validFrom: timestamp,
    validUntil: timestamp,
    horizonHours: z.union([z.literal(6), z.literal(24), z.literal(72)]),
    category: exposureCategorySchema.nullable(),
    state: z.enum(["assessed", "unknown"]),
    forecastRain: rainAggregateSchema,
    reasons: z
      .array(
        z.enum([
          "rain_below_attention_threshold",
          "rain_attention_threshold",
          "high_susceptibility_overlap",
          "low_local_susceptibility",
          "missing_local_susceptibility",
          "antecedent_wet_weather",
          "missing_rainfall",
          "missing_susceptibility",
          "incomplete_susceptibility",
          "missing_antecedent_rainfall",
          "no_catchment_link",
          "incomplete_catchment_assessments",
          "peak_six_hour_attention",
          "stale_weather",
          "future_source",
          "expired_window",
        ]),
      )
      .min(1),
  })
  .strict()
  .superRefine((v, c) => {
    if ((v.state === "assessed") !== (v.category !== null))
      c.addIssue({ code: "custom", message: "Unknown exposure cannot have a category" });
    if (Date.parse(v.validUntil) - Date.parse(v.validFrom) !== v.horizonHours * 3_600_000)
      c.addIssue({ code: "custom", message: "Invalid exposure time window" });
    if (
      (v.forecastRain.ok && v.forecastRain.hours !== v.horizonHours) ||
      (v.state === "assessed" && !v.forecastRain.ok)
    )
      c.addIssue({
        code: "custom",
        message: "Exposure rainfall must agree with its assessed horizon",
      });
  });
const windows = z
  .object({
    next24h: exposureWindowSchema,
    next72h: exposureWindowSchema,
    sixHourly: z.array(exposureWindowSchema).length(12),
  })
  .strict()
  .superRefine((v, c) => {
    const anchor = Date.parse(v.next24h.validFrom);
    if (
      v.next24h.horizonHours !== 24 ||
      v.next72h.horizonHours !== 72 ||
      Date.parse(v.next72h.validFrom) !== anchor ||
      v.sixHourly.some(
        (w, i) => w.horizonHours !== 6 || Date.parse(w.validFrom) !== anchor + i * 6 * 3_600_000,
      )
    )
      c.addIssue({
        code: "custom",
        message: "Exposure windows must share one consecutive forecast anchor",
      });
  });
export const exposureAssessmentSchema = z
  .object({
    schemaVersion: z.literal(1),
    assessmentId: hash,
    geometryRevision: hash,
    assessedAt: timestamp,
    anchorAt: timestamp,
    interpretation: z.literal("estimated_climate_exposure_not_disruption_probability"),
    automatedAlertUse: z.boolean(),
    policy: exposurePolicySchema,
    policySha256: hash,
    sources: z
      .object({
        weatherSha256: hash,
        hazardsSha256: hash,
        catchmentsSha256: hash,
        segmentsSha256: hash,
        weatherCapturedAt: timestamp,
        hazardsCapturedAt: timestamp,
        catchmentsPreparedAt: timestamp,
        forecastIssuedAt: z.null(),
        weatherModel: z.literal("ecmwf_ifs025"),
        nominalGridResolutionKm: z.literal(25),
        susceptibilityPublishedAt: z.null(),
        sourceUrls: z.array(z.url()).min(1),
      })
      .strict(),
    catchments: z
      .array(
        z
          .object({
            catchmentId: z.string().min(1),
            segmentIds: z.array(z.string().min(1)).min(1),
            associationConfidence: z.literal("low"),
            susceptibilityCoverageFraction: z.number().min(0).max(1),
            highSusceptibilityFraction: z.number().min(0).max(1),
            antecedentRain72h: rainAggregateSchema,
            antecedentRain168h: rainAggregateSchema,
            windows,
          })
          .strict(),
      )
      .min(1),
    segments: z
      .array(
        z
          .object({
            segmentId: z.string().min(1),
            catchmentIds: z.array(z.string().min(1)),
            distanceFromOriginStartKm: z.number().nonnegative(),
            distanceFromOriginEndKm: z.number().positive(),
            kilometerCalibration: z.literal("unverified"),
            rainfallAggregation: z.literal("maximum_linked_catchment_total"),
            windows,
          })
          .strict(),
      )
      .min(1),
    officialAdvisories: z
      .object({
        source: z.literal("senamhi"),
        capturedAt: timestamp,
        automatedAssessmentUse: z.literal(false),
        contextEndpoint: z.literal("/api/hazards"),
        note: z.literal("Official advisories remain separate context pending temporal eligibility"),
      })
      .strict(),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      Date.parse(v.anchorAt) % 3_600_000 ||
      Date.parse(v.assessedAt) < Date.parse(v.sources.weatherCapturedAt) ||
      Date.parse(v.anchorAt) !==
        Math.floor(Date.parse(v.sources.weatherCapturedAt) / 3_600_000) * 3_600_000
    )
      c.addIssue({ code: "custom", message: "Invalid assessment/source timing" });
    for (const items of [
      v.catchments.map((x) => x.catchmentId),
      v.segments.map((x) => x.segmentId),
    ])
      if (new Set(items).size !== items.length)
        c.addIssue({ code: "custom", message: "Duplicate assessment identity" });
    const segments = new Map(v.segments.map((s) => [s.segmentId, s]));
    const catchments = new Map(v.catchments.map((x) => [x.catchmentId, x]));
    for (const x of v.catchments) {
      if (
        new Set(x.segmentIds).size !== x.segmentIds.length ||
        x.segmentIds.some((id) => !segments.get(id)?.catchmentIds.includes(x.catchmentId))
      )
        c.addIssue({ code: "custom", message: "Invalid catchment links" });
    }
    for (const x of v.segments) {
      if (
        x.distanceFromOriginEndKm <= x.distanceFromOriginStartKm ||
        new Set(x.catchmentIds).size !== x.catchmentIds.length ||
        x.catchmentIds.some((id) => !catchments.get(id)?.segmentIds.includes(x.segmentId))
      )
        c.addIssue({ code: "custom", message: "Invalid segment links" });
    }
    if ([...v.catchments, ...v.segments].some((x) => x.windows.next24h.validFrom !== v.anchorAt))
      c.addIssue({ code: "custom", message: "Inconsistent assessment anchor" });
  });
export type ExposurePolicy = z.infer<typeof exposurePolicySchema>;
export type ExposureCategory = z.infer<typeof exposureCategorySchema>;
export type ExposureWindow = z.infer<typeof exposureWindowSchema>;
export type ExposureAssessment = z.infer<typeof exposureAssessmentSchema>;
