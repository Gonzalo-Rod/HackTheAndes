import { createHash } from "node:crypto";
import type { AudioSource, Transcriber, VoiceInput } from "@/contracts/notifications";
import { logger } from "@/lib/logger";
export function createVoiceInput(deps: {
  source: AudioSource;
  transcriber: Transcriber;
  cache: { read(key: string): Promise<string | null>; save(key: string, text: string): Promise<void> };
  quota: (sender: string) => Promise<boolean>;
}): VoiceInput {
  return {
    async convert(message, requestId) {
      try {
        const key = createHash("sha256").update(`audio:${message.messageId}`).digest("hex");
        let text = await deps.cache.read(key);
        if (!text) {
          if (!(await deps.quota(message.from)))
            return { ok: false, reply: "Llegaste al límite de notas de voz. Espera 15 minutos o envía texto." };
          const audio = await deps.source.download(message.messageId, requestId);
          text = await deps.transcriber.transcribe(audio.bytes, audio.mimeType, requestId);
          if (!text)
            return {
              ok: false,
              reply: "No pude transcribir la nota de voz. Envía texto o una nota más clara. No se publicó ningún reporte.",
            };
          await deps.cache.save(key, text);
        }
        if (/^\s*(CONFIRMAR|ACTIVAR|SEMANAL\s+ACTIVAR)\b/i.test(text))
          return { ok: false, reply: "Para confirmar una publicación o suscripción, escribe el código en un mensaje de texto." };
        return { ok: true, message: { ...message, messageType: "text", text } };
      } catch (error) {
        logger.warn({
          requestId,
          operation: "audio.input",
          provider: "zavu-openai",
          result: "fallback",
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return {
          ok: false,
          reply: "No pude procesar esa nota de voz (máximo 8 MB). Envía texto o vuelve a intentar. No se publicó ningún reporte.",
        };
      }
    },
  };
}
