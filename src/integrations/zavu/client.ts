import { z } from "zod";
import { postJson, UpstreamError } from "@/integrations/http/fetch-json";
import type { MessagingProvider, OutboundText, SendFailure, SentMessage } from "@/integrations/messaging/types";
import { logger } from "@/lib/logger";
import { err, ok, type Result } from "@/lib/result";

const ZAVU_API_BASE_URL = "https://api.zavu.dev/v1";
/** WhatsApp text limit, https://docs.zavu.dev/guides/whatsapp/messages/text. */
export const MAX_TEXT_LENGTH = 4_096;
/** Zavu answers 409 with the original message when an idempotency key is reused. */
const IDEMPOTENT_REPLAY_STATUS = 409;

const messageResponseSchema = z.object({ message: z.object({ id: z.string().min(1) }) });
// `daily_limit_exceeded` is top level; `a2p_limit_exceeded` and `rate_limit_exceeded` are wrapped in `error`.
const errorBodySchema = z.object({ code: z.string().optional(), error: z.object({ code: z.string() }).optional() });

function errorCode(body: unknown): string | undefined {
  const parsed = errorBodySchema.safeParse(body);
  return parsed.success ? (parsed.data.code ?? parsed.data.error?.code) : undefined;
}

/** Maps https://docs.zavu.dev/api-reference/send-a-message errors to failures services act on. */
export function toSendFailure(error: unknown): SendFailure {
  if (!(error instanceof UpstreamError) || error.kind !== "http" || error.status === undefined) return "unavailable";
  if (error.status === 400 && errorCode(error.responseBody) === "whatsapp_window_closed") return "window_closed";
  if (error.status === 429) return "rate_limited";
  if (error.status >= 500) return "unavailable";
  return "rejected";
}

export interface ZavuClientOptions {
  apiKey: string;
  senderId: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export function createZavuClient(options: ZavuClientOptions): MessagingProvider {
  return {
    async sendText(message: OutboundText): Promise<Result<SentMessage, SendFailure>> {
      let response;
      try {
        response = await postJson(
          `${ZAVU_API_BASE_URL}/messages`,
          {
            to: message.to,
            text: message.text.slice(0, MAX_TEXT_LENGTH),
            channel: message.channel,
            // The provider defaults to SMS fallback; alternate-channel consent is not implemented.
            fallbackEnabled: false,
            messageType: "text",
            idempotencyKey: message.idempotencyKey,
          },
          {
            provider: "zavu",
            operation: "zavu.messages.send",
            requestId: message.requestId,
            headers: { Authorization: `Bearer ${options.apiKey}`, "Zavu-Sender": options.senderId },
            // The idempotency key lets Zavu drop duplicates, so retrying cannot send twice.
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
        logger.error({ operation: "zavu.messages.send", provider: "zavu", result: "error", reason: "unexpected_response" });
        return err("unavailable");
      }
      return ok({ providerMessageId: parsed.data.message.id });
    },
  };
}
