import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createZavuClient } from "./client";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const clientWith = (fetchImpl: typeof fetch) =>
  createZavuClient({ apiKey: "zv_test_key", senderId: "sender_1", fetchImpl, sleep: async () => undefined });

const message = { to: "+51900000000", text: "Hola", channel: "whatsapp" as const, idempotencyKey: "ack:msg_1" };

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("createZavuClient().sendText", () => {
  it("sends the documented request and returns the message ID", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(202, { message: { id: "msg_1", status: "queued" } }));
    expect(await clientWith(fetchImpl).sendText(message)).toEqual({ ok: true, value: { providerMessageId: "msg_1" } });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.zavu.dev/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer zv_test_key", "Zavu-Sender": "sender_1" });
    expect(JSON.parse(String(init.body))).toEqual({
      to: "+51900000000",
      text: "Hola",
      channel: "whatsapp",
      messageType: "text",
      idempotencyKey: "ack:msg_1",
    });
  });

  it("treats a 409 replay as the original successful send", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(409, { message: { id: "msg_1" } }));
    expect(await clientWith(fetchImpl).sendText(message)).toEqual({ ok: true, value: { providerMessageId: "msg_1" } });
  });

  it("maps a closed WhatsApp window without retrying", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, { code: "whatsapp_window_closed", message: "closed" }));
    expect(await clientWith(fetchImpl).sendText(message)).toEqual({ ok: false, error: "window_closed" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps both limit shapes to rate_limited", async () => {
    const top = vi.fn(async () => jsonResponse(429, { code: "daily_limit_exceeded", message: "x" }));
    expect(await clientWith(top).sendText(message)).toEqual({ ok: false, error: "rate_limited" });
    const wrapped = vi.fn(async () => jsonResponse(429, { error: { code: "rate_limit_exceeded", message: "x" } }));
    expect(await clientWith(wrapped).sendText(message)).toEqual({ ok: false, error: "rate_limited" });
  });

  it("maps bad credentials and blocked sends to rejected", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { code: "unauthorized", message: "x" }));
    expect(await clientWith(fetchImpl).sendText(message)).toEqual({ ok: false, error: "rejected" });
  });

  it("retries a provider outage, then reports unavailable", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, {}));
    expect(await clientWith(fetchImpl).sendText(message)).toEqual({ ok: false, error: "unavailable" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("reports a network failure as unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await clientWith(fetchImpl).sendText(message)).toEqual({ ok: false, error: "unavailable" });
  });

  it("rejects an unexpected success body", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(202, { unexpected: true }));
    expect(await clientWith(fetchImpl).sendText(message)).toEqual({ ok: false, error: "unavailable" });
  });

  it("truncates text to the WhatsApp limit", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(202, { message: { id: "msg_1" } }));
    await clientWith(fetchImpl).sendText({ ...message, text: "a".repeat(5_000) });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((JSON.parse(String(init.body)) as { text: string }).text).toHaveLength(4_096);
  });
});
