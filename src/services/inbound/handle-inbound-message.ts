import type { MessagingProvider } from "@/integrations/messaging/types";
import type { InboundMessageData } from "@/integrations/zavu/events";
import { logger } from "@/lib/logger";

/** Spanish replies shown to people on WhatsApp. */
export const REPLIES = {
  textReceived: "Gracias, recibimos tu mensaje. Pronto podrás reportar incidentes y consultar el estado de la Carretera Central por aquí.",
  locationReceived: "Gracias, recibimos tu ubicación.",
  mediaReceived: "Gracias, recibimos tu archivo.",
  unsupported: "Por ahora solo podemos leer texto, notas de voz, fotos y ubicaciones.",
} as const;

const MEDIA_TYPES = new Set(["image", "audio", "video", "document"]);

export function chooseReply(message: InboundMessageData): string {
  if (message.messageType === "text") return REPLIES.textReceived;
  if (message.messageType === "location") return REPLIES.locationReceived;
  if (MEDIA_TYPES.has(message.messageType)) return REPLIES.mediaReceived;
  return REPLIES.unsupported;
}

/**
 * First version of the inbound pipeline: acknowledge every message on the channel it came
 * from. Report extraction and the command router build on this.
 */
export async function handleInboundMessage(message: InboundMessageData, messaging: MessagingProvider): Promise<void> {
  const result = await messaging.sendText({
    to: message.from,
    text: chooseReply(message),
    channel: message.channel === "sms" ? "sms" : "whatsapp",
    // One acknowledgment per inbound message, even if processing runs twice.
    idempotencyKey: `ack:${message.messageId}`,
  });

  if (result.ok) {
    logger.info({ operation: "inbound.acknowledge", result: "ok", messageId: message.messageId, messageType: message.messageType });
  } else {
    logger.warn({ operation: "inbound.acknowledge", result: "error", messageId: message.messageId, reason: result.error });
  }
}
