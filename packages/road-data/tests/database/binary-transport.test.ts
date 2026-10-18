import { expect, it } from "vitest";
import { createBinaryTransport } from "../../src/integrations/http/binary-transport.ts";
import { validateHydrobasinsArchive } from "../../src/integrations/hydrobasins/archive.ts";
const silent = () => undefined;
it.each([429, 500])(
  "retries HTTP %s twice and returns the successful archive bytes",
  async (status) => {
    let attempts = 0;
    const transport = createBinaryTransport({
      fetch: async () => {
        attempts++;
        return attempts < 3
          ? new Response("unavailable", { status })
          : new Response(new Uint8Array([1, 2]));
      },
      sleep: async () => undefined,
      logger: silent,
    });
    expect(await transport.getBytes("https://example.test/archive")).toEqual(
      new Uint8Array([1, 2]),
    );
    expect(attempts).toBe(3);
  },
);
it("stops after the timeout retry budget and reports a typed timeout", async () => {
  let attempts = 0;
  const transport = createBinaryTransport({
    timeoutMs: 5,
    fetch: async (_url, options) => {
      attempts++;
      return new Promise((_resolve, reject) =>
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
          once: true,
        }),
      );
    },
    sleep: async () => undefined,
    logger: silent,
  });
  await expect(transport.getBytes("https://example.test/archive")).rejects.toMatchObject({
    kind: "timeout",
  });
  expect(attempts).toBe(3);
});
it("rejects oversized bodies without retrying and rejects wrong archive identity", async () => {
  let attempts = 0;
  const transport = createBinaryTransport({
    maxBytes: 1,
    fetch: async () => {
      attempts++;
      return new Response(new Uint8Array([1, 2]));
    },
    logger: silent,
  });
  await expect(transport.getBytes("https://example.test/archive")).rejects.toThrow("byte limit");
  expect(attempts).toBe(1);
  expect(() => validateHydrobasinsArchive(new Uint8Array([0x50, 0x4b, 1, 2]))).toThrow("identity");
});
