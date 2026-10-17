import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { postJson } from "../../src/integrations/http/post-json.ts";
import {
  HttpTransportError,
  type HttpLogEntry,
} from "../../src/integrations/http/json-transport.ts";

afterEach(() => vi.unstubAllGlobals());

test("admin POST sends authorization without logging headers or body", async () => {
  const logs: HttpLogEntry[] = [];
  vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get("Authorization"), "Bearer fixture-value");
    return Response.json({ accepted: true });
  });
  const value = await postJson(
    "https://example.test/admin",
    { privateField: "fixture-content" },
    { requestId: "admin-1", headers: { Authorization: "Bearer fixture-value" } },
    (entry) => logs.push(entry),
  );
  assert.deepEqual(value, { accepted: true });
  assert.equal(logs[0]?.operation, "http.post_json");
  assert.equal(JSON.stringify(logs).includes("fixture-value"), false);
  assert.equal(JSON.stringify(logs).includes("fixture-content"), false);
});

test.each([429, 500])(
  "admin mutation HTTP %s is not retried after an uncertain outcome",
  async (status) => {
    let attempts = 0;
    vi.stubGlobal("fetch", async () => {
      attempts++;
      return new Response("unavailable", { status });
    });
    await assert.rejects(
      postJson("https://example.test/admin", {}, {}, () => undefined),
      (error) => error instanceof HttpTransportError && error.status === status,
    );
    assert.equal(attempts, 1);
  },
);

test("cancelled admin mutations are not sent", async () => {
  let attempts = 0;
  vi.stubGlobal("fetch", async () => {
    attempts++;
    return Response.json({});
  });
  await assert.rejects(
    postJson("https://example.test/admin", {}, { signal: AbortSignal.abort() }, () => undefined),
    { name: "AbortError" },
  );
  assert.equal(attempts, 0);
});
