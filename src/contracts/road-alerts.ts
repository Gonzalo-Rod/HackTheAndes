import { z } from "zod";

// Contract for /api/sutran/alerts and /api/sutran/alerts/:id. Shared by the route
// handlers (which build these shapes) and the dashboard (which validates them).

export const ROAD_STATUSES = ["interrumpido", "restringido", "normal", "desconocido"] as const;
export const ALERT_CAUSES = ["accidentes", "infraestructura", "fenomenos_naturales", "humano", "otro"] as const;

export const RoadStatusSchema = z.enum(ROAD_STATUSES);
export const AlertCauseSchema = z.enum(ALERT_CAUSES);
const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const RoadAlertSchema = z.object({
  id: z.string().min(1),
  code: z.string(),
  cause: AlertCauseSchema,
  roadStatus: RoadStatusSchema,
  title: z.string(),
  description: z.string(),
  currentSituation: z.string(),
  lat: z.number(),
  lng: z.number(),
  region: z.string(),
  regionKey: z.string(),
  province: z.string(),
  district: z.string(),
  roadCode: z.string(),
  roadName: z.string(),
  kmText: z.string(),
  km: z.number().nullable(),
  kmEnd: z.number().nullable(),
  direction: z.string(),
  pnpActions: z.string().nullable(),
  detainedPassengers: z.number(),
  detainedGoods: z.number(),
  eventDate: IsoDateSchema.nullable(),
  validFrom: IsoDateSchema.nullable(),
  validUntil: IsoDateSchema.nullable(),
  administrator: z.string(),
  source: z.string(),
  sourceUrl: z.string().nullable(),
  reportCount: z.number(),
  lastActionAt: IsoDateTimeSchema.nullable(),
});

export const AlertsMetaSchema = z.object({
  source: z.literal("SUTRAN"),
  endpoint: z.string(),
  /** When the server last received a valid upstream response. */
  fetchedAt: IsoDateTimeSchema,
  servedAt: IsoDateTimeSchema,
  latestActionAt: IsoDateTimeSchema.nullable(),
  /** True when serving the last valid response after an upstream failure. */
  stale: z.boolean(),
  staleReason: z.string().nullable(),
  /** Records dropped because they were expired, not yet valid or failed validation. */
  skippedCount: z.number().int().nonnegative(),
});

export const AlertsResponseSchema = z.object({
  alerts: z.array(RoadAlertSchema),
  meta: AlertsMetaSchema,
});

export const AlertHistoryEntrySchema = z.object({
  date: IsoDateTimeSchema.nullable(),
  type: z.string(),
  newStatus: RoadStatusSchema.nullable(),
});

export const AlertEvidenceSchema = z.object({
  kind: z.enum(["foto", "video"]),
  url: z.string().nullable(),
  posterUrl: z.string().nullable(),
  name: z.string().nullable(),
});

export const AlertDetailResponseSchema = z.object({
  id: z.string(),
  subcause: z.string().nullable(),
  tags: z.array(z.string()),
  evidence: z.array(AlertEvidenceSchema),
  /** Null when the history request failed (the rest of the detail is still valid). */
  history: z.array(AlertHistoryEntrySchema).nullable(),
  fetchedAt: IsoDateTimeSchema,
});

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export type RoadStatus = z.infer<typeof RoadStatusSchema>;
export type AlertCause = z.infer<typeof AlertCauseSchema>;
export type RoadAlert = z.infer<typeof RoadAlertSchema>;
export type AlertsMeta = z.infer<typeof AlertsMetaSchema>;
export type AlertsResponse = z.infer<typeof AlertsResponseSchema>;
export type AlertHistoryEntry = z.infer<typeof AlertHistoryEntrySchema>;
export type AlertEvidence = z.infer<typeof AlertEvidenceSchema>;
export type AlertDetailResponse = z.infer<typeof AlertDetailResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
