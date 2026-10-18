import { z } from "zod";

import { AlertHistoryEntrySchema, RoadAlertSchema } from "@/contracts/road-alerts";

// State file of the weekly Carretera Central incident report (docs/research/weekly/*.json).
// scripts/weekly-incident-report_christian.ts writes it after every run and validates it
// before the next run merges new observations into it.

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const WebUrlSchema = z.url().refine((value) => /^https?:\/\//i.test(value), "Expected an HTTP(S) URL");

/** An ISO week in Lima time: Monday to Sunday, both inclusive. */
export const ReportWindowSchema = z.object({
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
});

export const SourceRunSchema = z.object({
  ok: z.boolean(),
  /** Items this source contributed to the report in the run. */
  kept: z.number().int().nonnegative(),
  /** Error type when the source failed, or a note when it only partly answered. */
  note: z.string().nullable(),
});

export const RunLogSchema = z.object({
  at: IsoDateTimeSchema,
  sources: z.object({
    sutran: SourceRunSchema,
    indeci: SourceRunSchema,
    googleNews: SourceRunSchema,
  }),
});

export const SutranEntrySchema = z.object({
  alert: RoadAlertSchema,
  /** Status changes from SUTRAN's /historial, newest first. */
  history: z.array(AlertHistoryEntrySchema),
  firstSeenAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
  /** False once a successful SUTRAN read no longer lists the alert (expired or removed). */
  listedInLatestRun: z.boolean(),
});

export const IndeciPlaceSchema = z.object({
  level: z.enum(["distrito", "provincia"]),
  names: z.array(z.string().min(1)).min(1),
  department: z.string().min(1),
});

export const IndeciEntrySchema = z.object({
  url: WebUrlSchema,
  title: z.string(),
  hazard: z.string(),
  place: IndeciPlaceSchema,
  publishedAt: IsoDateTimeSchema.nullable(),
  /** "Fecha y hora de la ocurrencia" from the report page, in Lima time. */
  occurredDate: IsoDateSchema.nullable(),
  occurredTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  description: z.string().nullable(),
  firstSeenAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
});

export const NewsEntrySchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  outlet: z.string().nullable(),
  url: WebUrlSchema,
  /** When Google News listed the item, which can be a re-index of an older article. */
  listedAt: IsoDateTimeSchema,
  placeTerms: z.array(z.string()),
  incidentTerms: z.array(z.string()),
  queries: z.array(z.string()),
  firstSeenAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
});

export const WeeklyStateSchema = z.object({
  version: z.literal(1),
  window: ReportWindowSchema,
  updatedAt: IsoDateTimeSchema,
  runs: z.array(RunLogSchema),
  sutran: z.array(SutranEntrySchema),
  indeci: z.array(IndeciEntrySchema),
  news: z.array(NewsEntrySchema),
});

export type ReportWindow = z.infer<typeof ReportWindowSchema>;
export type SourceRun = z.infer<typeof SourceRunSchema>;
export type RunLog = z.infer<typeof RunLogSchema>;
export type SutranEntry = z.infer<typeof SutranEntrySchema>;
export type IndeciPlace = z.infer<typeof IndeciPlaceSchema>;
export type IndeciEntry = z.infer<typeof IndeciEntrySchema>;
export type NewsEntry = z.infer<typeof NewsEntrySchema>;
export type WeeklyState = z.infer<typeof WeeklyStateSchema>;
