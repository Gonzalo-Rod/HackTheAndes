import { z } from "zod";
import { postForm } from "@/integrations/http/fetch-json";
import type { Transcriber } from "@/contracts/notifications";
import { logger } from "@/lib/logger";
const responseSchema = z.object({ text: z.string().trim().min(1).max(4096) });
export function createOpenAiTranscriber(config: { apiKey: string; model: string }, fetchImpl?: typeof fetch): Transcriber {
  return {
    async transcribe(audio, mimeType, requestId) {
      const extension: Record<string, string> = {
        "audio/ogg": "ogg",
        "audio/mpeg": "mp3",
        "audio/mp4": "m4a",
        "audio/wav": "wav",
        "audio/webm": "webm",
      };
      const form = new FormData();
      form.set("model", config.model);
      form.set("language", "es");
      form.set("response_format", "json");
      form.set("file", new Blob([new Uint8Array(audio)], { type: mimeType }), `voice.${extension[mimeType] ?? "ogg"}`);
      try {
        const raw = await postForm("https://api.openai.com/v1/audio/transcriptions", form, {
          provider: "openai",
          operation: "audio.transcribe",
          requestId,
          headers: { Authorization: `Bearer ${config.apiKey}` },
          fetchImpl,
        });
        return responseSchema.parse(raw).text;
      } catch (error) {
        logger.warn({
          requestId,
          operation: "audio.transcribe",
          provider: "openai",
          result: "fallback",
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return null;
      }
    },
  };
}
