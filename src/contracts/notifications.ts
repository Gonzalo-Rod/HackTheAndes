import { z } from "zod";
import type { InboundMessageData } from "@/integrations/zavu/events";
export const subscriptionRangeSchema = z
  .object({
    startKm: z.number().nonnegative(),
    endKm: z.number().positive(),
    label: z.string().min(1).max(300),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .refine((v) => v.endKm > v.startKm);
export type SubscriptionRange = z.infer<typeof subscriptionRangeSchema>;
export interface SubscriptionRouter {
  touch(message: InboundMessageData): Promise<void>;
  handle(message: InboundMessageData, requestId: string, intent?: "subscribe" | "unsubscribe"): Promise<string | null>;
}
export interface VoiceInput {
  convert(
    message: InboundMessageData,
    requestId: string,
  ): Promise<{ ok: true; message: InboundMessageData } | { ok: false; reply: string }>;
}
export interface Transcriber {
  transcribe(audio: Uint8Array, mimeType: string, requestId: string): Promise<string | null>;
}
export interface AudioSource {
  download(messageId: string, requestId: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
}
export const alertCandidateSchema = z.object({
  key: z.string().min(1).max(200),
  fingerprint: z.string().min(1).max(300),
  kind: z.enum(["official", "community", "exposure"]),
  level: z.number().int().min(-1).max(3),
  startKm: z.number().nonnegative(),
  endKm: z.number().nonnegative(),
  expiresAt: z.iso.datetime(),
  text: z.string().min(1).max(800),
  isTest: z.boolean(),
});
export type AlertCandidate = z.infer<typeof alertCandidateSchema>;
export const checkpointSchema = z.record(z.string(), z.object({ fingerprint: z.string(), level: z.number().int().min(-1).max(3) }));
export type AlertCheckpoint = z.infer<typeof checkpointSchema>;
