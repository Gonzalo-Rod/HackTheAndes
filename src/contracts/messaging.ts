import { z } from "zod";

export const messageIntentSchema = z
  .object({
    kind: z.enum(["status", "exposure", "report", "subscribe", "unsubscribe", "help"]),
    place: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();
export type MessageIntent = z.infer<typeof messageIntentSchema>;
export interface IntentParser {
  parse(text: string, requestId: string): Promise<MessageIntent | null>;
}
/** Completion must survive restarts; failed work must remain retryable. */
export interface WebhookProcessor {
  processOnce(provider: string, eventKey: string, work: () => Promise<void>): Promise<boolean>;
}
