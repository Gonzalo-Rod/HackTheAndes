import { z } from "zod";

import { WeeklyStateSchema } from "./weekly-incident-report_christian";
import { EvidenceCoordinatesSchema, EvidenceGeometrySchema } from "./evidence-geometry_christian";

export const RESEARCH_TOPICS = ["water", "frost", "landslides", "rain", "agriculture", "pests"] as const;
export const ResearchTopicSchema = z.enum(RESEARCH_TOPICS);
export type ResearchTopic = z.infer<typeof ResearchTopicSchema>;

export const HttpUrlSchema = z.url().refine((value) => /^https?:\/\//i.test(value), "Expected an HTTP(S) URL");
export const EvidenceDateSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
export const EvidenceKindSchema = z.enum(["forecast", "inventory", "observation", "report", "scenario", "surveillance"]);
const FactSchema = z.object({ label: z.string(), value: z.string() });
export const ForecastDaySchema = z.object({
  date: z.iso.date(),
  tmaxC: z.number().nullable(),
  tminC: z.number().nullable(),
  description: z.string(),
});

// Environmental evidence has its own contract: it must never become a RoadAlert
// merely because a forecast, station, or seasonal report has coordinates.
export const EnvironmentalRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  summary: z.string(),
  location: z.string(),
  topics: z.array(ResearchTopicSchema).min(1),
  kind: EvidenceKindSchema,
  provider: z.string(),
  sourceUrl: HttpUrlSchema,
  sourceStatus: z.string(),
  recordType: z.string(),
  coordinates: EvidenceCoordinatesSchema.nullable(),
  geometry: EvidenceGeometrySchema.nullable(),
  geometrySourceUrl: HttpUrlSchema.nullable(),
  coordinatePrecision: z.string().nullable(),
  issuedAt: EvidenceDateSchema.nullable(),
  startsAt: EvidenceDateSchema.nullable(),
  endsAt: EvidenceDateSchema.nullable(),
  periodLabel: z.string().nullable(),
  facts: z.array(FactSchema),
  forecasts: z.array(ForecastDaySchema),
  caveats: z.array(z.string()),
});
export type EnvironmentalRecord = z.infer<typeof EnvironmentalRecordSchema>;

export const ResearchSourceSchema = z.object({
  id: z.string().min(1),
  provider: z.string(),
  title: z.string(),
  url: HttpUrlSchema,
  categories: z.array(ResearchTopicSchema),
  sourceKind: z.string(),
  geographicScope: z.string(),
  verifiedAt: z.iso.datetime({ offset: true }),
  accessStatus: z.string(),
  observedFacts: z.array(z.string()),
  limitations: z.array(z.string()),
  automation: z.string(),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

export const ResearchDocumentSchema = z.object({
  name: z.string().min(1),
  title: z.string(),
  format: z.enum(["json", "md"]),
  url: z.string().startsWith("/api/research/documents/"),
});
export type ResearchDocument = z.infer<typeof ResearchDocumentSchema>;

export const ResearchCatalogSchema = z.object({
  servedAt: z.iso.datetime({ offset: true }),
  retrievedAt: z.iso.datetime({ offset: true }).nullable(),
  scope: z.string(),
  records: z.array(EnvironmentalRecordSchema),
  sources: z.array(ResearchSourceSchema),
  weeklyReports: z.array(WeeklyStateSchema),
  documents: z.array(ResearchDocumentSchema),
  warnings: z.array(z.string()),
  archivedRecordCount: z.number().int().nonnegative(),
});
export type ResearchCatalog = z.infer<typeof ResearchCatalogSchema>;
