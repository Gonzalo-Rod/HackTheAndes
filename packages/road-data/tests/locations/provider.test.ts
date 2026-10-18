import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createMtcLandmarkProvider,
  LandmarkPayloadError,
} from "../../src/integrations/mtc/landmarks.ts";
import {
  createFetchJsonTransport,
  HttpTransportError,
} from "../../src/integrations/http/json-transport.ts";
import { payload } from "./support.ts";

function layer(url: string) {
  return Number(new URL(url).pathname.split("/").at(-2));
}
test("normalizes route-filtered toll/SOS and spatial bridge queries with attribution and cancellation", async () => {
  const signal = new AbortController().signal;
  const calls: string[] = [];
  const provider = createMtcLandmarkProvider({
    clock: () => new Date("2026-10-17T21:00:00Z"),
    transport: {
      getJson: async (url, options) => {
        calls.push(url);
        assert.equal(options?.requestId, "locations-1");
        assert.equal(options.signal, signal);
        assert.equal(options.provider, "mtc-ign-landmarks");
        return payload(layer(url));
      },
    },
  });
  const result = await provider.fetchLandmarks({ requestId: "locations-1", signal });
  assert.equal(result.landmarks.length, 3);
  assert.equal(result.sourceUrls.length, 3);
  assert.equal(result.retrievedAt, "2026-10-17T21:00:00.000Z");
  assert.equal(result.landmarks[2]?.reportedRoadCode, null);
  assert.equal(new URL(calls[0] ?? "").searchParams.get("where"), "ruta = 'PE-22'");
  assert.equal(new URL(calls[2] ?? "").searchParams.get("geometryType"), "esriGeometryEnvelope");
});
test.each([
  null,
  { error: { code: 500 } },
  { type: "FeatureCollection", features: [] },
  { ...payload(5), exceededTransferLimit: true },
  { ...payload(5), features: [...payload(5).features, ...payload(5).features] },
  {
    ...payload(5),
    features: [
      { ...payload(5).features[0], properties: { nombre: "CORCONA", ruta: "PE-22A", inicio: 48 } },
    ],
  },
  {
    ...payload(5),
    features: [
      {
        ...payload(5).features[0],
        geometry: {
          type: "MultiPoint",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
      },
    ],
  },
])(
  "rejects malformed, duplicate, empty, truncated, or wrong-route source data",
  async (invalid) => {
    const provider = createMtcLandmarkProvider({ transport: { getJson: async () => invalid } });
    await assert.rejects(provider.fetchLandmarks(), LandmarkPayloadError);
  },
);
test.each([429, 500])("GET retries HTTP %s through the shared wrapper", async (status) => {
  let attempts = 0;
  const provider = createMtcLandmarkProvider({
    transport: createFetchJsonTransport({
      logger: () => undefined,
      sleep: async () => undefined,
      random: () => 0,
      fetch: async (url) => {
        attempts++;
        return attempts === 1
          ? new Response("unavailable", { status })
          : Response.json(payload(layer(String(url))));
      },
    }),
  });
  assert.equal((await provider.fetchLandmarks()).landmarks.length, 3);
  assert.equal(attempts, 4);
});
test("a real timeout in the shared wrapper aborts the provider call", async () => {
  const provider = createMtcLandmarkProvider({
    transport: createFetchJsonTransport({
      timeoutMs: 5,
      maxRetries: 0,
      logger: () => undefined,
      fetch: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    }),
  });
  await assert.rejects(
    provider.fetchLandmarks(),
    (error) => error instanceof HttpTransportError && error.kind === "timeout",
  );
});
