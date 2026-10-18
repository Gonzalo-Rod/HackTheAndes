import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backoffDelayMs, getJson, MAX_RETRIES, postJson, UpstreamError } from "./fetch-json";

const noSleep = vi.fn(async () => undefined);
const base = { provider: "test", operation: "test.get", sleep: noSleep, random: () => 0 };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  noSleep.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("getJson", () => {
  it("returns the parsed body on success", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: 1 }));
    await expect(getJson("https://x.test/a", { ...base, fetchImpl })).resolves.toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 and succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ ok: 2 }));
    await expect(getJson("https://x.test/a", { ...base, fetchImpl })).resolves.toEqual({ ok: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a 429 at most twice, then throws", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429));
    const error = await getJson("https://x.test/a", { ...base, fetchImpl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({ kind: "http", status: 429 });
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_RETRIES + 1);
    expect(noSleep).toHaveBeenCalledTimes(MAX_RETRIES);
  });

  it("does not retry a 404", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 404));
    await expect(getJson("https://x.test/a", { ...base, fetchImpl })).rejects.toMatchObject({ kind: "http", status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("aborts after the timeout and reports it", async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const error = await getJson("https://x.test/a", { ...base, fetchImpl, timeoutMs: 20, retries: 0 }).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "timeout" });
  });

  it("does not retry a body that is not JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>", { status: 200 }));
    await expect(getJson("https://x.test/a", { ...base, fetchImpl })).rejects.toMatchObject({ kind: "invalid_body" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("caps the requested retries at the repository limit", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 503));
    await expect(getJson("https://x.test/a", { ...base, fetchImpl, retries: 10 })).rejects.toBeInstanceOf(UpstreamError);
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });
});

describe("backoffDelayMs", () => {
  it("grows exponentially with bounded jitter", () => {
    expect(backoffDelayMs(1, () => 0)).toBe(400);
    expect(backoffDelayMs(2, () => 0)).toBe(800);
    expect(backoffDelayMs(2, () => 0.999)).toBeLessThan(1600);
  });
});

describe("postJson", () => {
  const post = { ...base, operation: "test.post" };

  it("sends a JSON body and returns status and parsed body", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "m1" }, 202));
    await expect(postJson("https://x.test/m", { a: 1 }, { ...post, idempotent: true, fetchImpl })).resolves.toEqual({
      status: 202,
      body: { id: "m1" },
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("retries a 503 when the request is idempotent", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ id: "m1" }, 202));
    await expect(postJson("https://x.test/m", {}, { ...post, idempotent: true, fetchImpl })).resolves.toMatchObject({ status: 202 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never retries a request that is not idempotent", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 503));
    await expect(postJson("https://x.test/m", {}, { ...post, idempotent: false, fetchImpl })).rejects.toBeInstanceOf(UpstreamError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps the provider error body for the adapter to map", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: "whatsapp_window_closed" }, 400));
    const error = await postJson("https://x.test/m", {}, { ...post, idempotent: true, fetchImpl }).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "http", status: 400, responseBody: { code: "whatsapp_window_closed" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats accepted statuses as a normal answer", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "m1" }, 409));
    await expect(postJson("https://x.test/m", {}, { ...post, idempotent: true, acceptStatuses: [409], fetchImpl })).resolves.toEqual({
      status: 409,
      body: { id: "m1" },
    });
  });
});
