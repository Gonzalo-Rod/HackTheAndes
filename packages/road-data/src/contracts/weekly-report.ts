import { z } from "zod";
const timestamp = z.iso.datetime();
export const reportPeriodSchema = z
  .object({ start: timestamp, end: timestamp, key: z.string().min(1).max(100) })
  .strict();
export const reportRangeSchema = z
  .object({
    startKm: z.number().nonnegative(),
    endKm: z.number().positive(),
    label: z.string().min(1).max(300),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const reportRainfallStretchSchema = z
  .object({
    startKm: z.number().nonnegative(),
    endKm: z.number().positive(),
    rainMmPeriod: z.number().nonnegative().nullable(),
    rainMmNext72h: z.number().nonnegative().nullable(),
  })
  .strict()
  .refine((stretch) => stretch.endKm > stretch.startKm, "Invalid rainfall stretch");
export type ReportRainfallStretch = z.infer<typeof reportRainfallStretchSchema>;
export const environmentalReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: timestamp,
    period: reportPeriodSchema,
    range: reportRangeSchema,
    isDemo: z.boolean(),
    observations: z
      .object({
        firstRecordedAt: timestamp.nullable(),
        officialEnvironmentalAlerts: z.number().int().nonnegative(),
        communityEnvironmentalIncidents: z.number().int().nonnegative(),
        source: z.literal("first_observed_in_our_archive_not_event_onset"),
        closureHours: z.null(),
      })
      .strict(),
    outlook: z
      .object({
        assessmentId: z.string().min(1),
        policyVersion: z.literal("climate-exposure-v1"),
        capturedAt: timestamp,
        validFrom: timestamp,
        validUntil: timestamp,
        state: z.enum(["ready", "stale", "unavailable"]),
        kilometers: z
          .object({
            routine: z.number().nonnegative(),
            watch: z.number().nonnegative(),
            priority: z.number().nonnegative(),
            high_attention: z.number().nonnegative(),
            unknown: z.number().nonnegative(),
          })
          .strict(),
        // Optional so stored v1 reports remain readable during delivery retries.
        rainfallStretches: z.array(reportRainfallStretchSchema).max(10_000).optional(),
        catchments: z
          .array(
            z
              .object({
                id: z.string(),
                rainMmPeriod: z.number().nonnegative().nullable(),
                rainMmNext72h: z.number().nonnegative().nullable(),
              })
              .strict(),
          )
          .max(100),
      })
      .strict(),
    facts: z
      .array(z.object({ id: z.string().min(1), text: z.string().min(1).max(600) }).strict())
      .min(1)
      .max(12),
    summaryIds: z.array(z.string()).max(5),
    limitations: z.array(z.string().max(800)).min(1).max(20),
    sources: z.array(z.url()).min(1).max(50),
  })
  .strict()
  .superRefine((report, context) => {
    if (
      Date.parse(report.period.start) >= Date.parse(report.period.end) ||
      Date.parse(report.period.end) > Date.parse(report.generatedAt) ||
      report.range.startKm >= report.range.endKm
    )
      context.addIssue({ code: "custom", message: "Invalid report period or range" });
    if (
      report.outlook.rainfallStretches?.some(
        (stretch, index, stretches) =>
          stretch.startKm < report.range.startKm ||
          stretch.endKm > report.range.endKm ||
          (index > 0 && stretch.startKm < (stretches[index - 1]?.endKm ?? report.range.startKm)),
      )
    )
      context.addIssue({
        code: "custom",
        message: "Rainfall stretches must be ordered within the report range",
      });
    if (
      new Set(report.summaryIds).size !== report.summaryIds.length ||
      report.summaryIds.some((id) => !report.facts.some((fact) => fact.id === id))
    )
      context.addIssue({ code: "custom", message: "Summary must reference unique computed facts" });
  });
export type EnvironmentalReport = z.infer<typeof environmentalReportSchema>;
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;
export type ReportRange = z.infer<typeof reportRangeSchema>;
