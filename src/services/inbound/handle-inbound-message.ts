import type { MessagingProvider } from "@/integrations/messaging/types";
import type { InboundMessageData } from "@/integrations/zavu/events";
import type { IntentParser, MessageIntent } from "@/contracts/messaging";
import { HELP_REPLY, parseCommand } from "@/domain/messaging/commands";
import { logger } from "@/lib/logger";
import type { RoadInformation } from "./road-information";

export const REPLIES = {
  help: HELP_REPLY,
  media:
    "Aún no puedo interpretar notas de voz ni fotos. Escribe ESTADO o EXPOSICION, o comparte un pin de WhatsApp. El archivo no se ha publicado como reporte.",
  report:
    "El registro de reportes aún no está disponible aquí. Tu mensaje no se ha publicado ni confirmado como incidente. Puedes consultar ESTADO o EXPOSICION.",
  subscribe:
    "Las suscripciones automáticas aún no están disponibles en este canal. No se ha activado una suscripción. Consulta ESTADO o EXPOSICION cuando lo necesites.",
  unsubscribe: "Este canal todavía no tiene suscripciones automáticas activas. No se activará una suscripción con este mensaje.",
  empty: "Envía una consulta de texto o un pin de WhatsApp. Escribe AYUDA para ver las opciones.",
  unsupported: "Por ahora atiendo consultas de texto y ubicaciones de WhatsApp. Escribe AYUDA.",
  parserUnavailable: "No pude interpretar la consulta. Usa ESTADO o EXPOSICION, o comparte un pin sobre PE-22.",
} as const;
export interface InboundDependencies {
  messaging: MessagingProvider;
  information: RoadInformation;
  intentParser: IntentParser | null;
}
async function intentReply(intent: MessageIntent, information: RoadInformation, requestId: string): Promise<string> {
  switch (intent.kind) {
    case "status":
      return information.status(requestId);
    case "exposure":
      return information.exposure(intent.place ? { place: intent.place } : null, requestId);
    case "report":
      return REPLIES.report;
    case "subscribe":
      return REPLIES.subscribe;
    case "unsubscribe":
      return REPLIES.unsubscribe;
    case "help":
      return REPLIES.help;
  }
}
export async function chooseReply(message: InboundMessageData, deps: InboundDependencies, requestId: string): Promise<string> {
  if (message.messageType === "location") {
    const content = message.content;
    return content?.latitude !== undefined && content.longitude !== undefined
      ? deps.information.exposure({ latitude: content.latitude, longitude: content.longitude }, requestId)
      : REPLIES.empty;
  }
  if (["image", "audio", "video", "document"].includes(message.messageType)) return REPLIES.media;
  if (message.messageType !== "text") return REPLIES.unsupported;
  if (!message.text.trim()) return REPLIES.empty;
  const command = parseCommand(message.text);
  if (command) return intentReply(command, deps.information, requestId);
  const intent = await deps.intentParser?.parse(message.text, requestId);
  return intent ? intentReply(intent, deps.information, requestId) : REPLIES.parserUnavailable;
}
export async function handleInboundMessage(message: InboundMessageData, deps: InboundDependencies, requestId: string): Promise<void> {
  const result = await deps.messaging.sendText({
    to: message.from,
    text: await chooseReply(message, deps, requestId),
    channel: "whatsapp",
    idempotencyKey: `reply:v1:${message.messageId}`,
    requestId,
  });
  if (!result.ok) {
    logger.warn({ requestId, operation: "inbound.reply", provider: "zavu", result: "error", reason: result.error });
    // The webhook returns 503 and releases its incomplete delivery lease, so redelivery can retry.
    throw new Error("Outbound reply unavailable");
  }
  logger.info({ requestId, operation: "inbound.reply", provider: "zavu", result: "ok" });
}
