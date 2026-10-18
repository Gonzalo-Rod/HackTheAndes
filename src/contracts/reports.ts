import { z } from "zod";
import { roadContextResponseSchema } from "@peruroad/road-data/context/contracts";
import { messageIntentSchema } from "./messaging";

export const reportExtractionSchema = z
  .object({
    type: z.enum(["huaico", "derrumbe", "inundación", "bloqueo", "accidente", "obra", "otro"]).nullable(),
    placeText: z.string().trim().min(1).max(200).nullable(),
    kilometer: z.number().min(0).max(1000).nullable(),
    direction: z.enum(["hacia_lima", "hacia_la_oroya", "ambos"]).nullable(),
    severity: z.number().int().min(1).max(3).nullable(),
    lanesBlocked: z.number().int().min(0).max(8).nullable(),
    stillActive: z.boolean().nullable(),
  })
  .strict();
export type ReportExtraction = z.infer<typeof reportExtractionSchema>;
export interface ReportExtractor {
  extract(text: string, requestId: string): Promise<ReportExtraction | null>;
}
export const reportLocationSchema = z
  .object({
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
    segmentId: z.string().min(1).max(150),
    snappedPosition: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
    distanceFromOriginKm: z.number().nonnegative(),
    distanceFromRoadM: z.number().min(0).max(500),
  })
  .strict();
export const reportDraftSchema = z
  .object({
    id: z.uuid(),
    confirmationCode: z.string().regex(/^[A-F0-9]{8}$/),
    sourceMessageId: z.string().min(1).max(200),
    receivedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    rawText: z.string().min(1).max(12000),
    extraction: reportExtractionSchema,
    location: reportLocationSchema.nullable(),
    isTeam: z.boolean(),
    isTest: z.boolean(),
  })
  .strict();
export type ReportDraft = z.infer<typeof reportDraftSchema>;
export const reportRoutingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reply"), text: z.string().min(1).max(4096) }).strict(),
  z.object({ kind: z.literal("intent"), intent: messageIntentSchema.nullable() }).strict(),
  z.object({ kind: z.literal("unhandled") }).strict(),
]);
export type ReportRouting = z.infer<typeof reportRoutingSchema>;
export type ReportPublication = { incidentId: string; reportId: string; merged: boolean; independentReporters: number };
export interface ReportSession {
  replay(eventKey: string): Promise<ReportRouting | null>;
  readDraft(): Promise<ReportDraft | null>;
  commit(input: {
    eventKey: string;
    nextDraft: ReportDraft | null;
    publication?: ReportDraft;
    now: string;
    reply: (publication: ReportPublication | null) => ReportRouting;
  }): Promise<ReportRouting>;
}
export interface ReportRepository {
  run<T>(phoneKey: string, work: (session: ReportSession) => Promise<T>): Promise<T>;
}
export interface ReportRouter {
  route(
    message: {
      messageId: string;
      from: string;
      messageType: string;
      text: string;
      content?: { latitude?: number; longitude?: number } | null;
    },
    requestId: string,
  ): Promise<ReportRouting>;
}
export const parsedReportContextSchema = roadContextResponseSchema;
