import { z } from "zod";

export const roadStatusSchema = z.enum(["interrumpido", "restringido", "normal", "unknown"]);
const timestamp = z.iso.datetime({ offset: true });

export const officialRoadAlertSchema = z.object({
  source: z.literal("sutran"),
  externalId: z.uuid(),
  externalCode: z.string().min(1),
  roadCode: z.string().min(1),
  roadStatus: roadStatusSchema,
  sourceRoadStatus: z.string(),
  cause: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  currentSituation: z.string().nullable(),
  location: z
    .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .nullable(),
  kilometerLabel: z.string().nullable(),
  kilometer: z.number().nonnegative().nullable(),
  direction: z.string().nullable(),
  sourceEntity: z.string().nullable(),
  // Calendar dates in Peru: no hour or closure duration is implied.
  eventDate: z.iso.date().nullable(),
  validFrom: z.iso.date().nullable(),
  validUntil: z.iso.date().nullable(),
  sourceUpdatedAt: timestamp.nullable(),
  retrievedAt: timestamp,
  expired: z.boolean(),
  notYetValid: z.boolean(),
});

export const officialAlertHistoryEntrySchema = z.object({
  source: z.literal("sutran"),
  externalId: z.uuid(),
  occurredAt: timestamp,
  eventType: z.string(),
  roadStatus: roadStatusSchema.nullable(),
  sourceRoadStatus: z.string().nullable(),
});

export type RoadStatus = z.infer<typeof roadStatusSchema>;
export type OfficialRoadAlert = z.infer<typeof officialRoadAlertSchema>;
export type OfficialAlertHistoryEntry = z.infer<typeof officialAlertHistoryEntrySchema>;

export interface RejectedSourceRecord {
  readonly index: number;
  readonly issues: readonly { readonly path: string; readonly message: string }[];
}

/** Partial success is explicit; callers must not interpret omissions as clearance. */
export interface SourceBatch<T> {
  readonly records: readonly T[];
  readonly rejected: readonly RejectedSourceRecord[];
  readonly complete: boolean;
  readonly receivedCount: number;
  readonly filteredCount: number;
  readonly retrievedAt: string;
  readonly sourceUrl: string;
}
