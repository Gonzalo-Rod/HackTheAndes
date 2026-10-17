import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createFetchJsonTransport,
  HttpTransportError,
} from "../../src/integrations/http/json-transport.ts";

type TransportOptions = NonNullable<Parameters<typeof createFetchJsonTransport>[0]>;
function createTestTransport(options: TransportOptions = {}) {
  return createFetchJsonTransport({ maxRetries: 0, logger: () => undefined, ...options });
}

test("requests JSON with GET and disables the framework fetch cache", async () => {
  const transport = createTestTransport({
    fetch: async (url, init) => {
      assert.equal(url, "https://example.test/alerts");
      assert.equal(init?.method, "GET");
      assert.equal(init?.cache, "no-store");
      assert.deepEqual(init?.headers, { Accept: "application/json" });
      assert.ok(init?.signal instanceof AbortSignal);
      return Response.json({ success: true, data: [] });
    },
  });
  assert.deepEqual(await transport.getJson("https://example.test/alerts"), {
    success: true,
    data: [],
  });
});

test("reports HTTP failures with retryability without exposing response bodies", async () => {
  for (const [status, retryable] of [
    [400, false],
    [401, false],
    [408, false],
    [429, true],
    [503, true],
  ] as const) {
    const transport = createTestTransport({
      fetch: async () => new Response("sensitive upstream details", { status }),
    });
    await assert.rejects(transport.getJson("https://example.test/alerts"), (error: unknown) => {
      assert.ok(error instanceof HttpTransportError);
      assert.equal(error.status, status);
      assert.equal(error.kind, "http");
      assert.equal(error.retryable, retryable);
      assert.equal(error.message.includes("sensitive"), false);
      return true;
    });
  }
});

test("invalid JSON has a different failure type from an empty feed", async () => {
  const transport = createTestTransport({
    fetch: async () => new Response("<html>unavailable</html>"),
  });
  await assert.rejects(transport.getJson("https://example.test/alerts"), (error: unknown) => {
    assert.ok(error instanceof HttpTransportError);
    assert.equal(error.kind, "invalid_json");
    assert.equal(error.retryable, false);
    return true;
  });
});

test("network failures are retryable without leaking arbitrary upstream errors", async () => {
  const transport = createTestTransport({
    fetch: async () => {
      throw new Error("private proxy token");
    },
  });
  await assert.rejects(transport.getJson("https://example.test/alerts"), (error: unknown) => {
    assert.ok(error instanceof HttpTransportError);
    assert.equal(error.kind, "network");
    assert.equal(error.retryable, true);
    assert.equal(error.message.includes("token"), false);
    return true;
  });
});

test("times out a stalled request", async () => {
  const transport = createTestTransport({
    timeoutMs: 5,
    fetch: async (_url, init) => {
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(Response.json({})), 1000);
        init?.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(init.signal?.reason);
          },
          { once: true },
        );
      });
    },
  });
  await assert.rejects(transport.getJson("https://example.test/alerts"), (error: unknown) => {
    assert.ok(error instanceof HttpTransportError);
    assert.equal(error.kind, "timeout");
    return true;
  });
});

test("cancellation is preserved and a pre-aborted request never reaches fetch", async () => {
  const controller = new AbortController();
  const reason = new Error("caller cancelled");
  controller.abort(reason);
  let calls = 0;
  const transport = createTestTransport({
    fetch: async () => {
      calls++;
      return Response.json({});
    },
  });
  await assert.rejects(
    transport.getJson("https://example.test/alerts", { signal: controller.signal }),
    (error: unknown) => error === reason,
  );
  assert.equal(calls, 0);
});

test("the timeout also covers a response whose JSON body stalls", async () => {
  const transport = createTestTransport({
    timeoutMs: 5,
    fetch: async (_url, init) => {
      const response = Response.json({});
      response.json = () =>
        new Promise((_resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("body stalled")), 1000);
          init?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(init.signal?.reason);
            },
            { once: true },
          );
        });
      return response;
    },
  });
  await assert.rejects(transport.getJson("https://example.test/alerts"), (error: unknown) => {
    assert.ok(error instanceof HttpTransportError);
    assert.equal(error.kind, "timeout");
    return true;
  });
});

test("caller cancellation during fetch is not reclassified as a network failure", async () => {
  const controller = new AbortController();
  const reason = new Error("cancel the active poll");
  const transport = createTestTransport({
    fetch: async (_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        controller.abort(reason);
      });
    },
  });
  await assert.rejects(
    transport.getJson("https://example.test/alerts", { signal: controller.signal }),
    (error: unknown) => error === reason,
  );
});

test("rejects invalid timeout configuration", () => {
  for (const timeoutMs of [0, -1, NaN, 1.5, Infinity, 120001]) {
    assert.throws(() => createTestTransport({ timeoutMs }), RangeError);
  }
});
