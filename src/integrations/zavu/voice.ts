import { postJson } from "@/integrations/http/fetch-json";
import type { OutboundVoiceCall, SendFailure, SentMessage, VoiceCaller } from "@/integrations/messaging/types";
import { logger } from "@/lib/logger";
import { err, ok, type Result } from "@/lib/result";
import { messageResponseSchema, toSendFailure } from "./client";

const ZAVU_MESSAGES_URL = "https://api.zavu.dev/v1/messages";
/** Our cap, not Zavu's: about one minute of speech, so a driver hears the whole notice. */
export const MAX_VOICE_TEXT_LENGTH = 900;
const IDEMPOTENT_REPLAY_STATUS = 409;

export interface ZavuVoiceOptions {
  apiKey: string;
  senderId: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * One-way text-to-speech calls through `POST /v1/messages` with `channel: "voice"`.
 * Zavu's conversational Voice Agent (`POST /v1/calls`) connected but stayed silent in the
 * October 17 checks, so incident calls use the TTS channel that was verified by hand.
 */
export function createZavuVoiceCaller(options: ZavuVoiceOptions): VoiceCaller {
  return {
    async placeTextToSpeechCall(call: OutboundVoiceCall): Promise<Result<SentMessage, SendFailure>> {
      let response;
      try {
        response = await postJson(
          ZAVU_MESSAGES_URL,
          {
            to: call.to,
            text: call.text.slice(0, MAX_VOICE_TEXT_LENGTH),
            channel: "voice",
            voiceLanguage: call.language,
            fallbackEnabled: false,
            idempotencyKey: call.idempotencyKey,
          },
          {
            provider: "zavu",
            operation: "zavu.voice.call",
            requestId: call.requestId,
            headers: { Authorization: `Bearer ${options.apiKey}`, "Zavu-Sender": options.senderId },
            // The idempotency key makes Zavu drop a repeated request, so a retry cannot dial twice.
            idempotent: true,
            acceptStatuses: [IDEMPOTENT_REPLAY_STATUS],
            fetchImpl: options.fetchImpl,
            sleep: options.sleep,
          },
        );
      } catch (error) {
        return err(toSendFailure(error));
      }

      const parsed = messageResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        logger.error({ operation: "zavu.voice.call", provider: "zavu", result: "error", reason: "unexpected_response" });
        return err("unavailable");
      }
      return ok({ providerMessageId: parsed.data.message.id });
    },
  };
}
