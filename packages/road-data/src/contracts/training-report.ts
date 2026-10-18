import { z } from "zod";
import { geometryRevisionSchema } from "./training-labels.ts";
import { horizonSchema } from "./logistic-training.ts";
const counts = z
  .object({
    rows: z.number().int().nonnegative(),
    positiveRows: z.number().int().nonnegative(),
    negativeRows: z.number().int().nonnegative(),
    episodes: z.number().int().nonnegative(),
    positiveEpisodes: z.number().int().nonnegative(),
    negativeEpisodes: z.number().int().nonnegative(),
  })
  .strict();
const metrics = z
  .object({
    precision: z.number().min(0).max(1),
    recall: z.number().min(0).max(1),
    f1: z.number().min(0).max(1),
    truePositiveWindows: z.number().int().nonnegative(),
    falsePositiveWindows: z.number().int().nonnegative(),
    logLoss: z.number().nonnegative().nullable(),
    brierScore: z.number().nonnegative().nullable(),
    averagePrecision: z.number().min(0).max(1).nullable(),
  })
  .strict();
export const trainingReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    operation: z.enum(["train", "evaluate"]),
    status: z.enum(["blocked", "trained_experimental", "evaluated_experimental"]),
    createdAt: z.iso.datetime({ offset: true }),
    horizonHours: horizonSchema,
    datasetSha256: geometryRevisionSchema,
    policySha256: geometryRevisionSchema,
    artifactSha256: geometryRevisionSchema.nullable(),
    blockers: z.array(z.string()),
    splits: z
      .object({
        train: counts,
        validation: counts,
        test: counts,
        purgedRows: z.number().int().nonnegative(),
      })
      .strict(),
    metrics: z
      .object({
        train: metrics.nullable(),
        validation: metrics.nullable(),
        test: metrics.nullable(),
      })
      .strict(),
    baseline: z
      .object({
        rainThresholdMm: z.number().nonnegative().nullable(),
        validation: metrics.nullable(),
        test: metrics.nullable(),
      })
      .strict(),
    interpretation: z.literal("reviewed_windows_only_not_full_season_alarm_rates"),
    probabilitiesCalibrated: z.literal(false),
  })
  .strict();
