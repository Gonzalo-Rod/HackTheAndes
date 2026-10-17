import { z } from "zod";

/**
 * Webhook payloads from https://docs.zavu.dev/guides/receiving-messages/events.
 * Only the fields we use are validated; unknown fields are ignored so that
 * additions on Zavu's side do not break the receiver.
 */
export const zavuEnvelopeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  /** Unix milliseconds when Zavu dispatched the webhook. */
  timestamp: z.number(),
  senderId: z.string().optional(),
  data: z.unknown(),
});

export type ZavuEnvelope = z.infer<typeof zavuEnvelopeSchema>;

const contentSchema = z
  .object({
    mediaId: z.string().optional(),
    mediaUrl: z.string().optional(),
    mimeType: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    name: z.string().optional(),
    address: z.string().optional(),
    replyToMessageId: z.string().optional(),
    interactiveReply: z.object({ type: z.string(), id: z.string(), title: z.string().optional() }).optional(),
  })
  .nullish();

export const inboundMessageDataSchema = z.object({
  messageId: z.string().min(1),
  /** E.164 number, or a WhatsApp business-scoped user ID (BSUID). Treat as opaque. */
  from: z.string().min(1),
  channel: z.string().min(1),
  messageType: z.string().min(1),
  text: z.string().default(""),
  content: contentSchema,
  providerTimestamp: z.number().nullish(),
});

export type InboundMessageData = z.infer<typeof inboundMessageDataSchema>;

export const INBOUND_MESSAGE_EVENT = "message.inbound";
