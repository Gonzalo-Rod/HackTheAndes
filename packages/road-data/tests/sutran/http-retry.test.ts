import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createFetchJsonTransport,
  HttpTransportError,
} from "../../src/integrations/http/json-transport.ts";
import type { HttpLogEntry } from "../../src/integrations/http/json-transport.ts";

test("retries idempotent GETs with bounded backoff, jitter, and Retry-After", async () => {
  const responses = [
    new Response("upstream error", { status: 500 }),
    new Response("rate limited", { status: 429, headers: { "Retry-After": "2" } }),
    Response.json({ success: true, data: [] }),
  ];
  const waits: number[] = [];
  const logs: HttpLogEntry[] = [];
  const transport = createFetchJsonTransport({
    fetch: async () => {
      const response = responses.shift();
      assert.ok(response, "Unexpected extra retry");
      return response;
    },
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
    random: () => 0.5,
    logger: (entry) => logs.push(entry),
  });
  await transport.getJson("https://example.test/private-query", {
    requestId: "test-request",
    provider: "sutran",
  });
  assert.deepEqual(waits, [375, 2000]);
  assert.deepEqual(
    logs.map((entry) => entry.result),
    ["failure", "failure", "success"],
  );
  assert.ok(
    logs.every((entry) => entry.requestId === "test-request" && entry.provider === "sutran"),
  );
  assert.equal(JSON.stringify(logs).includes("private-query"), false);
  assert.equal(JSON.stringify(logs).includes("upstream error"), false);
});

test("stops after two retries and logs each failed attempt", async () => {
  let calls = 0;
  const logs: HttpLogEntry[] = [];
  const transport = createFetchJsonTransport({
    fetch: async () => {
      calls++;
      throw new Error("private provider details");
    },
    sleep: async () => undefined,
    logger: (entry) => logs.push(entry),
  });
  await assert.rejects(transport.getJson("https://example.test/alerts"), HttpTransportError);
  assert.equal(calls, 3);
  assert.equal(logs.length, 3);
  assert.ok(logs.every((entry) => entry.errorType === "network"));
});

test("a long Retry-After is surfaced rather than ignored or waited on indefinitely", async () => {
  let calls = 0;
  const transport = createFetchJsonTransport({
    fetch: async () => {
      calls++;
      return new Response(null, { status: 429, headers: { "Retry-After": "3600" } });
    },
    sleep: async () => {
      assert.fail("Must not sleep beyond the job budget");
    },
    logger: () => undefined,
  });
  await assert.rejects(transport.getJson("https://example.test/alerts"), (error: unknown) => {
    assert.ok(error instanceof HttpTransportError);
    assert.equal(error.retryAfterMs, 3_600_000);
    return true;
  });
  assert.equal(calls, 1);
});

test("does not retry client errors or invalid JSON even when retries are enabled", async () => {
  for (const response of [new Response(null, { status: 401 }), new Response("not JSON")]) {
    let calls = 0;
    const transport = createFetchJsonTransport({
      fetch: async () => {
        calls++;
        return response;
      },
      sleep: async () => {
        assert.fail("Unexpected retry");
      },
      logger: () => undefined,
    });
    await assert.rejects(transport.getJson("https://example.test/alerts"), HttpTransportError);
    assert.equal(calls, 1);
  }
});

test("rejects retry configuration above the team's limit", () => {
  for (const maxRetries of [-1, 3, NaN, 1.5]) {
    assert.throws(() => createFetchJsonTransport({ maxRetries }), RangeError);
  }
});
