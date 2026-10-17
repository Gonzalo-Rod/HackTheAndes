import { z } from "zod";
import { RoadAlertSchema } from "./road-alerts";
import { normalizePhone } from "@/domain/access/phone";

export const WaitlistInputSchema = z
  .object({
    requestId: z.uuid(),
    company: z.string().trim().min(2).max(120),
    contactName: z.string().trim().min(2).max(100),
    role: z.string().trim().min(2).max(80),
    fleetSize: z.number().int().min(0).max(100_000).nullable(),
    routes: z.array(z.string().trim().min(2).max(120)).min(1).max(10),
    phone: z
      .string()
      .max(30)
      .transform(normalizePhone)
      .refine((value) => value !== null),
    consent: z.literal(true),
  })
  .strict();
export type WaitlistInput = z.infer<typeof WaitlistInputSchema>;
export const AccessCodeInputSchema = z.object({ code: z.string().trim().min(16).max(100) }).strict();
export const IncidentFeedSchema = z.object({
  alerts: z.array(RoadAlertSchema),
  meta: z.object({ servedAt: z.iso.datetime(), state: z.enum(["ready", "unavailable"]), message: z.string() }),
});
export type IncidentFeed = z.infer<typeof IncidentFeedSchema>;
const CountSchema = z.number().int().nonnegative();
export const StatsSchema = z.object({
  queriesAnswered: CountSchema,
  returningUsers: CountSchema,
  reports: CountSchema,
  uniqueReporters: CountSchema,
  returningReporters: CountSchema,
  subscribers: CountSchema,
  companiesOnWaitlist: CountSchema,
  dispatchDecisions: CountSchema,
  callsPlaced: CountSchema,
  callsAnswered: CountSchema,
  asOf: z.iso.datetime(),
  exclusions: z.array(z.string()),
});
export type PublicStats = z.infer<typeof StatsSchema>;
export const SegmentSchema = z.object({
  type: z.literal("Feature"),
  id: z.string(),
  geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.tuple([z.number(), z.number()])).min(2) }),
  properties: z.object({
    startDistanceKm: z.number(),
    endDistanceKm: z.number(),
    elevationM: z.number().nullable(),
    officialKmStart: z.number().nullable(),
    officialKmEnd: z.number().nullable(),
    kilometerCalibration: z.enum(["unverified", "calibrated"]),
  }),
});
export const SegmentsSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(SegmentSchema),
  geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
  retrievedAt: z.iso.datetime(),
  distanceReference: z.literal("geometry_distance"),
});
export type SegmentCollection = z.infer<typeof SegmentsSchema>;
export const RealtimeConfigSchema = z.object({ url: z.url(), publishableKey: z.string().min(20) });
export const WeeklyReportDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    summary: z.string().max(5000),
    metrics: z.record(z.string(), z.number().finite()),
    limitations: z.array(z.string()),
    generatedAt: z.iso.datetime(),
  })
  .strict();
