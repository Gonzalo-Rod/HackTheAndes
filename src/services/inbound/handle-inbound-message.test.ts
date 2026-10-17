import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessagingProvider } from "@/integrations/messaging/types";
import type { InboundMessageData } from "@/integrations/zavu/events";
import { err, ok } from "@/lib/result";
import { chooseReply, handleInboundMessage, REPLIES } from "./handle-inbound-message";
import { createMemoryDeduplicator } from "./memory-deduplicator";

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

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("chooseReply", () => {
  it.each([
    ["text", REPLIES.textReceived],
    ["location", REPLIES.locationReceived],
    ["audio", REPLIES.mediaReceived],
    ["image", REPLIES.mediaReceived],
    ["sticker", REPLIES.unsupported],
    ["contact", REPLIES.unsupported],
  ])("replies to %s messages", (messageType, expected) => {
    expect(chooseReply(message({ messageType }))).toBe(expected);
  });
});

describe("handleInboundMessage", () => {
  it("replies to the sender on the same channel with an idempotency key", async () => {
    const sendText = vi.fn<MessagingProvider["sendText"]>(async () => ok({ providerMessageId: "out_1" }));
    await handleInboundMessage(message(), { sendText });
    expect(sendText).toHaveBeenCalledWith({
      to: "+51900000000",
      text: REPLIES.textReceived,
      channel: "whatsapp",
      idempotencyKey: "ack:msg_1",
    });
  });

  it("replies by SMS to SMS messages", async () => {
    const sendText = vi.fn<MessagingProvider["sendText"]>(async () => ok({ providerMessageId: "out_1" }));
    await handleInboundMessage(message({ channel: "sms" }), { sendText });
    expect(sendText.mock.calls[0]?.[0].channel).toBe("sms");
  });

  it("logs a failed reply without throwing", async () => {
    const sendText = vi.fn<MessagingProvider["sendText"]>(async () => err("unavailable" as const));
    await expect(handleInboundMessage(message(), { sendText })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"reason":"unavailable"'));
  });
});

describe("createMemoryDeduplicator", () => {
  it("claims an event once per provider", async () => {
    const dedupe = createMemoryDeduplicator();
    expect(await dedupe.claim("zavu", "evt_1")).toBe(true);
    expect(await dedupe.claim("zavu", "evt_1")).toBe(false);
    expect(await dedupe.claim("qatom", "evt_1")).toBe(true);
  });

  it("forgets the oldest claim when full", async () => {
    const dedupe = createMemoryDeduplicator(2);
    await dedupe.claim("zavu", "a");
    await dedupe.claim("zavu", "b");
    await dedupe.claim("zavu", "c");
    expect(await dedupe.claim("zavu", "a")).toBe(true);
    expect(await dedupe.claim("zavu", "c")).toBe(false);
  });
});
