import { z } from "zod";
import { evidenceSchema, geometryRevisionSchema } from "./training-labels.ts";
export const FEATURE_NAMES = [
  "forecastRainMm",
  "antecedentRainMm72h",
  "antecedentRainMm168h",
  "meanSlopeDegrees",
  "catchmentAreaKm2",
] as const;
export const horizonSchema = z.union([z.literal(6), z.literal(24), z.literal(72)]);
const timestamp = z.iso.datetime({ offset: true });
export const featureValuesSchema = z
  .object({
    forecastRainMm: z.number().nonnegative(),
    antecedentRainMm72h: z.number().nonnegative(),
    antecedentRainMm168h: z.number().nonnegative(),
    meanSlopeDegrees: z.number().min(0).max(90),
    catchmentAreaKm2: z.number().positive(),
  })
  .strict();
export const asOfObservationSchema = z
  .object({
    id: z.string().min(1),
    catchmentId: z.string().min(1),
    decisionAt: timestamp,
    horizonHours: horizonSchema,
    features: featureValuesSchema,
    sources: z
      .array(
        z
          .object({
            featureNames: z.array(z.enum(FEATURE_NAMES)).min(1),
            kind: z.enum([
              "archived_forecast",
              "forecast_based_antecedent",
              "dem",
              "static_geometry",
            ]),
            availableAt: timestamp,
            evidence: evidenceSchema.extend({ sourceSha256: geometryRevisionSchema }),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((v, context) => {
    const names = v.sources.flatMap((s) => s.featureNames);
    if (
      names.length !== FEATURE_NAMES.length ||
      FEATURE_NAMES.some((n) => names.filter((x) => x === n).length !== 1)
    )
      context.addIssue({
        code: "custom",
        message: "Every feature needs exactly one availability evidence record",
      });
    if (v.sources.some((s) => Date.parse(s.availableAt) > Date.parse(v.decisionAt)))
      context.addIssue({ code: "custom", message: "Future information is not an as-of predictor" });
    const kinds = {
      forecastRainMm: "archived_forecast",
      antecedentRainMm72h: "forecast_based_antecedent",
      antecedentRainMm168h: "forecast_based_antecedent",
      meanSlopeDegrees: "dem",
      catchmentAreaKm2: "static_geometry",
    } as const;
    if (v.sources.some((s) => s.featureNames.some((n) => kinds[n] !== s.kind)))
      context.addIssue({
        code: "custom",
        message: "Feature provenance disagrees with feature semantics",
      });
    if (Date.parse(v.decisionAt) % 3_600_000 !== 0)
      context.addIssue({ code: "custom", message: "Decision times must align to a UTC hour" });
  });
export const observationRegistrySchema = z
  .object({
    schemaVersion: z.literal(1),
    geometryRevision: geometryRevisionSchema,
    observations: z.array(asOfObservationSchema),
  })
  .strict()
  .refine(
    (v) => new Set(v.observations.map((r) => r.id)).size === v.observations.length,
    "Duplicate feature observation",
  );
export const trainingRowSchema = z
  .object({
    id: z.string().min(1),
    catchmentId: z.string().min(1),
    decisionAt: timestamp,
    validUntil: timestamp,
    horizonHours: horizonSchema,
    label: z.union([z.literal(0), z.literal(1)]),
    episodeId: z.string().min(1),
    labelEvidenceIds: z.array(z.string().min(1)).min(1),
    features: featureValuesSchema,
    sources: asOfObservationSchema.shape.sources,
  })
  .strict()
  .superRefine((row, context) => {
    if (Date.parse(row.validUntil) - Date.parse(row.decisionAt) !== row.horizonHours * 3_600_000)
      context.addIssue({ code: "custom", message: "Label interval disagrees with horizon" });
    const checked = asOfObservationSchema.safeParse({
      id: row.id,
      catchmentId: row.catchmentId,
      decisionAt: row.decisionAt,
      horizonHours: row.horizonHours,
      features: row.features,
      sources: row.sources,
    });
    if (!checked.success)
      context.addIssue({ code: "custom", message: "Invalid as-of row provenance" });
  });
export const trainingDatasetSchema = z
  .object({
    schemaVersion: z.literal(1),
    target: z.literal("rainfall_related_road_disruption_onset"),
    dataKind: z.literal("reviewed_public_sources"),
    geometryRevision: geometryRevisionSchema,
    sourceHashes: z.record(z.string(), geometryRevisionSchema),
    rows: z.array(trainingRowSchema),
  })
  .strict();
const period = z.object({ fromUtc: timestamp, untilUtc: timestamp }).strict();
export const trainingPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.literal("logistic-v1-2024-2025"),
    train: period,
    validation: period,
    test: period,
    embargoHours: z.literal(72),
    regularizationC: z.number().positive(),
    maximumIterations: z.number().int().positive(),
    baselineQuantiles: z.array(z.number().min(0).max(1)).min(1),
  })
  .strict()
  .superRefine((v, c) => {
    for (const p of [v.train, v.validation, v.test])
      if (Date.parse(p.fromUtc) >= Date.parse(p.untilUtc))
        c.addIssue({ code: "custom", message: "Invalid split interval" });
    if (
      Date.parse(v.train.untilUtc) + v.embargoHours * 3_600_000 >
        Date.parse(v.validation.fromUtc) ||
      Date.parse(v.validation.untilUtc) + v.embargoHours * 3_600_000 > Date.parse(v.test.fromUtc)
    )
      c.addIssue({ code: "custom", message: "Chronological splits need the specified embargo" });
  });
const vector = z.array(z.number()).length(FEATURE_NAMES.length);
export const logisticArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    algorithm: z.literal("l2_logistic_regression"),
    target: z.literal("rainfall_related_road_disruption_onset"),
    status: z.literal("experimental"),
    probabilitiesCalibrated: z.literal(false),
    createdAt: timestamp,
    geometryRevision: geometryRevisionSchema,
    datasetSha256: geometryRevisionSchema,
    policySha256: geometryRevisionSchema,
    horizonHours: horizonSchema,
    featureNames: z.tuple([
      z.literal(FEATURE_NAMES[0]),
      z.literal(FEATURE_NAMES[1]),
      z.literal(FEATURE_NAMES[2]),
      z.literal(FEATURE_NAMES[3]),
      z.literal(FEATURE_NAMES[4]),
    ]),
    transform: z.literal("log1p_then_standard_scaler"),
    means: vector,
    scales: z.array(z.number().positive()).length(FEATURE_NAMES.length),
    coefficients: vector,
    intercept: z.number(),
    binaryThreshold: z.number().min(0).max(1),
    baselineRainThresholdMm: z.number().nonnegative(),
    regularizationC: z.number().positive(),
    trainingLibrary: z.string().min(1),
  })
  .strict();
export type AsOfObservation = z.infer<typeof asOfObservationSchema>;
export type TrainingDataset = z.infer<typeof trainingDatasetSchema>;
export type TrainingPolicy = z.infer<typeof trainingPolicySchema>;
export type LogisticArtifact = z.infer<typeof logisticArtifactSchema>;
export type FeatureValues = z.infer<typeof featureValuesSchema>;
