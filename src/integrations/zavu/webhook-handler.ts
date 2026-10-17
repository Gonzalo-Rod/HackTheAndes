import { randomUUID } from "node:crypto";
import type { WebhookDeduplicator } from "@/integrations/security/webhook";
import { logger } from "@/lib/logger";
import { INBOUND_MESSAGE_EVENT, inboundMessageDataSchema, type InboundMessageData, zavuEnvelopeSchema } from "./events";
import { verifyZavuSignature } from "./signature";

/** Zavu events are small JSON documents; anything larger is not from Zavu. */
export const MAX_BODY_BYTES = 256 * 1024;
export const SIGNATURE_HEADER = "x-zavu-signature";
const PROVIDER = "zavu";
const OPERATION = "zavu.webhook";

// Same shapes as the app's API responses; error bodies never include provider payloads.
const jsonResponse = (body: unknown, requestId: string, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
const errorResponse = (status: number, code: string, message: string, requestId: string) =>
  jsonResponse({ error: { code, message } }, requestId, status);

export interface ZavuWebhookDeps {
  webhookSecret: string;
  deduplicator: WebhookDeduplicator;
  onInboundMessage: (message: InboundMessageData) => Promise<void>;
  /** Runs work after the response is sent, so Zavu gets a fast 200 (Next.js `after`). */
  defer: (task: () => Promise<void>) => void;
  nowMs?: () => number;
}

export function createZavuWebhookHandler(deps: ZavuWebhookDeps) {
  const nowMs = deps.nowMs ?? Date.now;

  return async function handle(request: Request): Promise<Response> {
    const requestId = randomUUID();
    const log = (level: "info" | "warn" | "error", fields: Record<string, unknown>) =>
      logger[level]({ operation: OPERATION, provider: PROVIDER, requestId, ...fields });

    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
      return errorResponse(413, "payload_too_large", "Payload too large", requestId);
    }
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
      return errorResponse(413, "payload_too_large", "Payload too large", requestId);
    }

    const signature = verifyZavuSignature({
      rawBody,
      header: request.headers.get(SIGNATURE_HEADER),
      secret: deps.webhookSecret,
      nowMs: nowMs(),
    });
    if (!signature.valid) {
      log("warn", { result: "error", reason: signature.reason });
      return errorResponse(401, "invalid_signature", "Invalid signature", requestId);
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      // A signed body that is not JSON is a provider bug; 400 stops Zavu from retrying it.
      log("error", { result: "error", reason: "invalid_json" });
      return errorResponse(400, "invalid_json", "Body is not valid JSON", requestId);
    }

    const envelope = zavuEnvelopeSchema.safeParse(json);
    if (!envelope.success) {
      log("error", { result: "error", reason: "invalid_envelope" });
      return errorResponse(400, "invalid_event", "Unexpected event shape", requestId);
    }
    const event = envelope.data;

    if (event.type !== INBOUND_MESSAGE_EVENT) {
      log("info", { result: "skipped", eventId: event.id, eventType: event.type });
      return jsonResponse({ status: "ignored" }, requestId);
    }

    const message = inboundMessageDataSchema.safeParse(event.data);
    if (!message.success) {
      log("error", { result: "error", reason: "invalid_message", eventId: event.id });
      return errorResponse(400, "invalid_event", "Unexpected message shape", requestId);
    }

    // Claim only after the signature is verified, so forged requests cannot burn event IDs.
    if (!(await deps.deduplicator.claim(PROVIDER, event.id))) {
      log("info", { result: "skipped", reason: "duplicate", eventId: event.id });
      return jsonResponse({ status: "duplicate" }, requestId);
    }

    log("info", { result: "ok", eventId: event.id, channel: message.data.channel, messageType: message.data.messageType });
    deps.defer(async () => {
      try {
        await deps.onInboundMessage(message.data);
      } catch (error) {
        log("error", {
          result: "error",
          reason: "processing_failed",
          eventId: event.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    return jsonResponse({ status: "processed" }, requestId);
  };
}
