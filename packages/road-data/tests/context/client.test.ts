import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, test, vi } from "vitest";
import { createRoadContextClient } from "../../src/integrations/peruroad/road-context-client.ts";
import { HttpTransportError } from "../../src/integrations/http/json-transport.ts";

const secret = randomBytes(32).toString("base64url");
afterEach(() => vi.restoreAllMocks());
test("client validates before sending and passes read credentials only as a header", async () => {
  let calls = 0;
  const client = createRoadContextClient({
    baseUrl: "https://example.test",
    secret,
    post: async (url, body, options) => {
      calls++;
      assert.equal(url, "https://example.test/api/internal/road-context");
      assert.equal(options?.headers?.Authorization, `Bearer ${secret}`);
      assert.deepEqual(body, { kind: "official_alerts" });
      return {
        kind: "official_alerts",
        state: "ready",
        servedAt: "2026-10-17T22:00:00Z",
        asOf: null,
        dataAgeMs: null,
        message: "Consulta vial.",
        alerts: [],
        absenceDoesNotConfirmClearance: true,
      };
    },
  });
  assert.equal((await client.request({ kind: "official_alerts", phone: "sender" })).ok, false);
  assert.equal(calls, 0);
  assert.equal((await client.request({ kind: "official_alerts" })).ok, true);
  assert.equal(calls, 1);
});
test.each([
  new HttpTransportError("timeout"),
  new HttpTransportError("http", 500),
  new HttpTransportError("http", 429),
  new HttpTransportError("http", 401),
])("failed context calls return a visible fallback", async (failure) => {
  const client = createRoadContextClient({
    baseUrl: "https://example.test",
    secret,
    post: async () => {
      throw failure;
    },
  });
  const result = await client.request({ kind: "official_alerts" });
  assert.ok(!result.ok);
  assert.ok(result.error.message.length > 0);
  assert.equal(result.error.code, failure.status === 401 ? "unauthorized" : "unavailable");
});
test("malformed provider JSON is unavailable and insecure remote URLs fail at configuration", async () => {
  const client = createRoadContextClient({
    baseUrl: "https://example.test",
    secret,
    post: async () => ({ alerts: [] }),
  });
  assert.equal((await client.request({ kind: "official_alerts" })).ok, false);
  assert.throws(
    () => createRoadContextClient({ baseUrl: "http://example.test", secret }),
    /ROAD_DATA_API_URL/,
  );
});
test("the actual shared HTTP wrapper enforces POST, JSON, no redirects, and explicit failures", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    return new Response("private response", { status: 429 });
  });
  const client = createRoadContextClient({ baseUrl: "https://example.test", secret });
  const result = await client.request({ kind: "official_alerts" });
  assert.equal(result.ok, false);
  assert.equal(fetch.mock.calls.length, 1);
});
