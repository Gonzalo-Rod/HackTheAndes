import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createSutranAdapter,
  createFetchJsonTransport,
  HttpTransportError,
} from "../../src/integrations/sutran/index.ts";

test.each([500, 429])(
  "SUTRAN HTTP %i is unavailable infrastructure, never a successful empty feed",
  async (status) => {
    const adapter = createSutranAdapter({
      transport: createFetchJsonTransport({
        fetch: async () => new Response(null, { status }),
        maxRetries: 0,
        logger: () => undefined,
      }),
    });
    await assert.rejects(adapter.fetchCurrentAlerts(), (error: unknown) => {
      assert.ok(error instanceof HttpTransportError);
      assert.equal(error.status, status);
      return true;
    });
  },
);

test("a SUTRAN timeout is unavailable infrastructure, never a successful empty feed", async () => {
  const adapter = createSutranAdapter({
    transport: createFetchJsonTransport({
      fetch: async (_url, options) =>
        new Promise<Response>((resolve, reject) => {
          const timer = setTimeout(() => resolve(Response.json({})), 1000);
          options?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(options.signal?.reason);
            },
            { once: true },
          );
        }),
      timeoutMs: 5,
      maxRetries: 0,
      logger: () => undefined,
    }),
  });
  await assert.rejects(adapter.fetchCurrentAlerts(), (error: unknown) => {
    assert.ok(error instanceof HttpTransportError);
    assert.equal(error.kind, "timeout");
    return true;
  });
});
