import { z } from "zod";

import {
  EvidenceDateSchema,
  ForecastDaySchema,
  HttpUrlSchema,
  RESEARCH_TOPICS,
  ResearchSourceSchema,
} from "@/contracts/research_christian";

const JsonFields = z.record(z.string(), z.json());
const Period = z.object({ start: EvidenceDateSchema, end: EvidenceDateSchema });

// Shared input contract before the pure normalizer accesses data. Unused research
// fields are deliberately stripped; original files remain available for review.
export const EvidenceFeatureSchema = z.object({
  type: z.literal("Feature"),
  id: z.string().min(1),
  geometry: z
    .object({
      type: z.literal("Point"),
      coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
    })
    .nullable(),
  properties: z.object({
    recordType: z.string().min(1),
    status: z.string(),
    provider: z.string(),
    sourceUrl: HttpUrlSchema,
    severity: z.string().optional(),
    station: JsonFields.optional(),
    location: z.union([z.string(), JsonFields]).optional(),
    values: JsonFields.optional(),
    crop: JsonFields.optional(),
    observationPeriod: Period.optional(),
    validity: Period.optional(),
    validDates: z.array(z.iso.date()).optional(),
    forecastDays: z.array(ForecastDaySchema).optional(),
    forecastPeriod: Period.optional(),
    occurrence: z.object({ date: z.iso.date(), timeLocal: z.string() }).optional(),
    issueDate: z.iso.date().optional(),
    publicationDate: z.iso.date().optional(),
    publicationMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    eventDate: EvidenceDateSchema.optional(),
    reportUpdatedAt: EvidenceDateSchema.optional(),
    scenarioPeriod: z.string().optional(),
    coordinatePrecision: z.string().optional(),
    scope: JsonFields.optional(),
    aggregatedCounts: JsonFields.optional(),
    massMovementScenario: JsonFields.optional(),
    floodScenario: JsonFields.optional(),
    nationalExposureInVeryHighRiskDistricts: JsonFields.optional(),
    limitations: z.array(z.string()),
  }),
});
export type EvidenceFeature = z.infer<typeof EvidenceFeatureSchema>;

export const EvidenceFileSchema = z.object({
  type: z.literal("FeatureCollection"),
  retrievedAt: z.iso.datetime({ offset: true }),
  projectScope: z.string(),
  features: z.array(z.unknown()),
});
export const SourceFileSchema = z.object({ sources: z.array(z.unknown()) });

export const ResearchSourceInputSchema = ResearchSourceSchema.omit({ categories: true })
  .extend({
    categories: z.array(z.enum([...RESEARCH_TOPICS, "pest_alerts"])),
  })
  .transform(({ categories, ...source }) => ({
    ...source,
    categories: categories.map((category) => (category === "pest_alerts" ? ("pests" as const) : category)),
  }));
