import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { InboundMessageData } from "@/integrations/zavu/events";
import { err, ok } from "@/lib/result";
import { chooseReply, handleInboundMessage, REPLIES, type InboundDependencies } from "./handle-inbound-message";
import { createMemoryWebhookProcessor } from "./memory-webhook-processor";
const message = (overrides: Partial<InboundMessageData> = {}): InboundMessageData => ({
  messageId: "msg_1",
  from: "+51900000000",
  channel: "whatsapp",
  messageType: "text",
  text: "Hola",
  content: null,
  providerTimestamp: null,
  ...overrides,
});
function dependencies(): InboundDependencies {
  return {
    messaging: { sendText: vi.fn(async () => ok({ providerMessageId: "out_1" })) },
    information: { status: vi.fn(async () => "SUTRAN status"), exposure: vi.fn(async () => "Estimated exposure") },
    intentParser: { parse: vi.fn(async () => ({ kind: "exposure" as const, place: "Matucana" })) },
  };
}
beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
it("routes a command without asking the LLM", async () => {
  const deps = dependencies();
  expect(await chooseReply(message({ text: "ESTADO" }), deps, "req_1")).toBe("SUTRAN status");
  expect(deps.intentParser?.parse).not.toHaveBeenCalled();
});
it("uses structured natural-language intent to call the source service", async () => {
  const deps = dependencies();
  expect(await chooseReply(message({ text: "¿Habrá lluvia en Matucana?" }), deps, "req_1")).toBe("Estimated exposure");
  expect(deps.information.exposure).toHaveBeenCalledWith({ place: "Matucana" }, "req_1");
});
it("passes a location pin without sender identifiers to C", async () => {
  const deps = dependencies();
  await chooseReply(message({ messageType: "location", content: { latitude: -11.84, longitude: -76.39 } }), deps, "req_1");
  expect(deps.information.exposure).toHaveBeenCalledWith({ latitude: -11.84, longitude: -76.39 }, "req_1");
});
it.each([
  ["audio", REPLIES.media],
  ["image", REPLIES.media],
  ["sticker", REPLIES.unsupported],
  ["location", REPLIES.empty],
])("gives an honest fallback for %s", async (messageType, expected) => {
  expect(await chooseReply(message({ messageType }), dependencies(), "req_1")).toBe(expected);
});
it("does not claim a report was published or a subscription activated", async () => {
  const deps = dependencies();
  deps.intentParser = { parse: vi.fn(async () => ({ kind: "report" as const, place: null })) };
  expect(await chooseReply(message({ text: "Veo un derrumbe" }), deps, "req_1")).toBe(REPLIES.report);
  expect(await chooseReply(message({ text: "AVISAME" }), deps, "req_1")).toBe(REPLIES.subscribe);
  expect(await chooseReply(message({ text: "BAJA" }), deps, "req_1")).toBe(REPLIES.unsubscribe);
});
it("returns command help when OpenAI is absent, refuses or fails", async () => {
  const deps = { ...dependencies(), intentParser: null };
  expect(await chooseReply(message({ text: "¿Y mañana?" }), deps, "req_1")).toBe(REPLIES.parserUnavailable);
  expect(await chooseReply(message({ text: "  " }), deps, "req_1")).toBe(REPLIES.empty);
});
it("uses a stable send key and propagates the safe request ID", async () => {
  const deps = dependencies();
  await handleInboundMessage(message(), deps, "req_1");
  expect(deps.messaging.sendText).toHaveBeenCalledWith({
    to: "+51900000000",
    text: REPLIES.help,
    channel: "whatsapp",
    idempotencyKey: "reply:v1:msg_1",
    requestId: "req_1",
  });
});
it("propagates a delivery failure for webhook retry without logging recipients", async () => {
  const deps = dependencies();
  vi.mocked(deps.messaging.sendText).mockResolvedValue(err("unavailable"));
  await expect(handleInboundMessage(message(), deps, "req_1")).rejects.toThrow("Outbound reply unavailable");
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(message().from);
});
it("serializes concurrent deliveries and retries work after a failure", async () => {
  const processor = createMemoryWebhookProcessor();
  const work = vi.fn(async () => undefined);
  expect((await Promise.all(Array.from({ length: 5 }, () => processor.processOnce("zavu", "msg", work)))).filter(Boolean)).toHaveLength(1);
  expect(work).toHaveBeenCalledTimes(1);
  await expect(
    processor.processOnce("zavu", "other", async () => {
      throw new Error("failure");
    }),
  ).rejects.toThrow();
  expect(await processor.processOnce("zavu", "other", work)).toBe(true);
});
