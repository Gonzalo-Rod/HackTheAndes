import { z } from "zod";

/**
 * Webhook payloads from https://docs.zavu.dev/guides/receiving-messages/events.
 * Only the fields we use are validated; unknown fields are ignored so that
 * additions on Zavu's side do not break the receiver.
 */
export const zavuEnvelopeSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  /** Unix milliseconds when Zavu dispatched the webhook. */
  timestamp: z.number().int().nonnegative(),
  senderId: z.string().optional(),
  data: z.unknown(),
});

export type ZavuEnvelope = z.infer<typeof zavuEnvelopeSchema>;

const contentSchema = z
  .object({
    mediaId: z.string().optional(),
    mediaUrl: z.string().optional(),
    mimeType: z.string().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    name: z.string().optional(),
    address: z.string().optional(),
    replyToMessageId: z.string().optional(),
    interactiveReply: z.object({ type: z.string(), id: z.string(), title: z.string().optional() }).optional(),
  })
  .nullish();

export const inboundMessageDataSchema = z.object({
  messageId: z.string().min(1).max(200),
  /** E.164 number, or a WhatsApp business-scoped user ID (BSUID). Treat as opaque. */
  from: z.string().min(1).max(200),
  channel: z.string().min(1).max(50),
  messageType: z.string().min(1).max(50),
  text: z.string().max(4096).default(""),
  content: contentSchema,
  providerTimestamp: z.number().nullish(),
});

export type InboundMessageData = z.infer<typeof inboundMessageDataSchema>;

export const INBOUND_MESSAGE_EVENT = "message.inbound";
