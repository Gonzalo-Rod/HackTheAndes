import { z } from "zod";
import { gazetteerEntrySchema, roadLocationSchema, placeQuerySchema } from "./road-locations.ts";
import { storedOfficialAlertSchema } from "./ingestion.ts";

export const roadContextRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("pin"),
    longitude: z.number().min(-180).max(180),
    latitude: z.number().min(-90).max(90),
  }),
  z.strictObject({ kind: z.literal("place"), name: placeQuerySchema }),
  z.strictObject({ kind: z.literal("official_alerts") }),
]);
export const spatialContextSchema = z.object({ source: z.unknown(), gazetteer: z.unknown() });
export const officialContextArchiveSchema = z.object({
  records: z.array(storedOfficialAlertSchema).max(10_000),
  poll: z
    .object({
      startedAt: z.iso.datetime({ offset: true }),
      finishedAt: z.iso.datetime({ offset: true }),
    })
    .nullable(),
});
const metadataSchema = z.object({
  state: z.enum(["ready", "stale", "unavailable"]),
  servedAt: z.iso.datetime({ offset: true }),
  asOf: z.iso.datetime({ offset: true }).nullable(),
  dataAgeMs: z.number().nonnegative().nullable(),
  message: z.string(),
});
export const roadContextResponseSchema = z.discriminatedUnion("kind", [
  metadataSchema.extend({
    kind: z.literal("location"),
    status: z.enum(["matched", "ambiguous", "not_found", "outside_corridor", "unavailable"]),
    location: roadLocationSchema.nullable(),
    candidates: z.array(gazetteerEntrySchema),
    requiresConfirmation: z.literal(true),
  }),
  metadataSchema.extend({
    kind: z.literal("official_alerts"),
    alerts: z.array(storedOfficialAlertSchema),
    absenceDoesNotConfirmClearance: z.literal(true),
  }),
]);
export type RoadContextRequest = z.infer<typeof roadContextRequestSchema>;
export type RoadContextResponse = z.infer<typeof roadContextResponseSchema>;
export interface RoadContextRepository {
  readSpatial(): Promise<unknown>;
  readOfficial(): Promise<unknown>;
}
export interface RoadContextLog {
  requestId: string;
  operation: "road.context" | "road.context.http";
  provider: string;
  durationMs: number;
  result: string;
  errorType?: string;
}
