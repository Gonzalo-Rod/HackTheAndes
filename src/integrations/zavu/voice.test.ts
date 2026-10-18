import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createZavuVoiceCaller, MAX_VOICE_TEXT_LENGTH } from "./voice";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const callerWith = (fetchImpl: typeof fetch) =>
  createZavuVoiceCaller({ apiKey: "zv_test_key", senderId: "sender_1", fetchImpl, sleep: async () => undefined });

const call = { to: "+51900000000", text: "Hola", language: "es-ES", idempotencyKey: "incident-call:1" };

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("createZavuVoiceCaller().placeTextToSpeechCall", () => {
  it("sends a voice-channel message without SMS fallback", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(202, { message: { id: "msg_1", status: "queued" } }));
    expect(await callerWith(fetchImpl).placeTextToSpeechCall(call)).toEqual({ ok: true, value: { providerMessageId: "msg_1" } });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.zavu.dev/v1/messages");
    expect(init.headers).toMatchObject({ Authorization: "Bearer zv_test_key", "Zavu-Sender": "sender_1" });
    expect(JSON.parse(String(init.body))).toEqual({
      to: "+51900000000",
      text: "Hola",
      channel: "voice",
      voiceLanguage: "es-ES",
      fallbackEnabled: false,
      idempotencyKey: "incident-call:1",
    });
  });

  it("caps the spoken text", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(202, { message: { id: "msg_1" } }));
    await callerWith(fetchImpl).placeTextToSpeechCall({ ...call, text: "a".repeat(MAX_VOICE_TEXT_LENGTH + 50) });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((JSON.parse(String(init.body)) as { text: string }).text).toHaveLength(MAX_VOICE_TEXT_LENGTH);
  });

  it("treats a 409 replay as the original call", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(409, { message: { id: "msg_1" } }));
    expect(await callerWith(fetchImpl).placeTextToSpeechCall(call)).toEqual({ ok: true, value: { providerMessageId: "msg_1" } });
  });

  it("maps the daily voice limit to rate_limited after retries", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, { code: "daily_limit_exceeded", message: "x" }));
    expect(await callerWith(fetchImpl).placeTextToSpeechCall(call)).toEqual({ ok: false, error: "rate_limited" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("maps insufficient balance to rejected without retrying", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(402, { code: "insufficient_balance", message: "x" }));
    expect(await callerWith(fetchImpl).placeTextToSpeechCall(call)).toEqual({ ok: false, error: "rejected" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps a 500 and a timeout to unavailable", async () => {
    const failing = vi.fn(async () => jsonResponse(500, {}));
    expect(await callerWith(failing).placeTextToSpeechCall(call)).toEqual({ ok: false, error: "unavailable" });
    const timeout = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    expect(await callerWith(timeout).placeTextToSpeechCall(call)).toEqual({ ok: false, error: "unavailable" });
  });

  it("rejects an unexpected response body", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(202, { id: "msg_1" }));
    expect(await callerWith(fetchImpl).placeTextToSpeechCall(call)).toEqual({ ok: false, error: "unavailable" });
  });
});
