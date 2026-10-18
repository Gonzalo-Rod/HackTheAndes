import { randomUUID } from "node:crypto";
import type { WebhookProcessor } from "@/contracts/messaging";
import { logger } from "@/lib/logger";
import { INBOUND_MESSAGE_EVENT, inboundMessageDataSchema, type InboundMessageData, zavuEnvelopeSchema } from "./events";
import { verifyZavuSignature } from "./signature";

/** Bound memory consumption before parsing or trusting a webhook payload. */
export const MAX_BODY_BYTES = 256 * 1024;
export const SIGNATURE_HEADER = "x-zavu-signature";
const PROVIDER = "zavu";
const OPERATION = "zavu.webhook";
const jsonResponse = (body: unknown, requestId: string, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
const errorResponse = (status: number, code: string, message: string, requestId: string) =>
  jsonResponse({ error: { code, message } }, requestId, status);

async function boundedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks).toString("utf8");
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}
export interface ZavuWebhookDeps {
  webhookSecret: string;
  processor: WebhookProcessor;
  onInboundMessage: (message: InboundMessageData, requestId: string) => Promise<void>;
  nowMs?: () => number;
}
export function createZavuWebhookHandler(deps: ZavuWebhookDeps) {
  const nowMs = deps.nowMs ?? Date.now;
  return async function handle(request: Request): Promise<Response> {
    const requestId = randomUUID();
    const started = performance.now();
    const log = (level: "info" | "warn" | "error", fields: Record<string, unknown>) =>
      logger[level]({ operation: OPERATION, provider: PROVIDER, requestId, durationMs: performance.now() - started, ...fields });
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
      return errorResponse(413, "payload_too_large", "Payload too large", requestId);
    let rawBody: string | null;
    try {
      rawBody = await boundedBody(request);
    } catch {
      return errorResponse(400, "invalid_body", "Unable to read body", requestId);
    }
    if (rawBody === null) return errorResponse(413, "payload_too_large", "Payload too large", requestId);
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
      log("warn", { result: "error", reason: "invalid_json" });
      return errorResponse(400, "invalid_json", "Body is not valid JSON", requestId);
    }
    const envelope = zavuEnvelopeSchema.safeParse(json);
    if (!envelope.success) return errorResponse(400, "invalid_event", "Unexpected event shape", requestId);
    const event = envelope.data;
    if (event.type !== INBOUND_MESSAGE_EVENT) {
      // Failed delivery is visible without logging provider error text, phone or message contents.
      log(event.type === "message.failed" ? "warn" : "info", {
        result: event.type === "message.failed" ? "error" : "skipped",
        reason: event.type === "message.failed" ? "delivery_failed" : "unsupported_event",
      });
      return jsonResponse({ status: "ignored" }, requestId);
    }
    const message = inboundMessageDataSchema.safeParse(event.data);
    if (!message.success) return errorResponse(400, "invalid_event", "Unexpected message shape", requestId);
    if (message.data.channel !== "whatsapp") {
      log("info", { result: "skipped", reason: "unsupported_channel" });
      return jsonResponse({ status: "ignored" }, requestId);
    }
    try {
      // Message identity also deduplicates the same inbound message in different envelopes.
      const processed = await deps.processor.processOnce(PROVIDER, `inbound:${message.data.messageId}`, () =>
        deps.onInboundMessage(message.data, requestId),
      );
      log("info", { result: processed ? "ok" : "skipped", reason: processed ? "processed" : "duplicate" });
      return jsonResponse({ status: processed ? "processed" : "duplicate" }, requestId);
    } catch (error) {
      // Never log arbitrary exception messages: provider errors can contain recipient details.
      log("error", { result: "error", reason: "processing_failed", errorType: error instanceof Error ? error.name : "UnknownError" });
      return errorResponse(503, "processing_unavailable", "Unable to process message; retry delivery", requestId);
    }
  };
}
