import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createOpenMeteoElevationProvider,
  ElevationPayloadError,
} from "../../src/integrations/open-meteo/elevation.ts";
import {
  createFetchJsonTransport,
  HttpTransportError,
} from "../../src/integrations/http/json-transport.ts";
import type { Position } from "../../src/contracts/road-geometry.ts";

test("batches at 100 points, keeps coordinate order, and propagates correlation", async () => {
  const calls: URL[] = [];
  const provider = createOpenMeteoElevationProvider({
    transport: {
      getJson: async (value, options) => {
        assert.equal(options?.requestId, "elevation-1");
        assert.equal(options.provider, "open-meteo-elevation");
        const url = new URL(value);
        calls.push(url);
        const latitudes = url.searchParams.get("latitude")?.split(",") ?? [];
        return { elevation: latitudes.map((_, index) => (calls.length - 1) * 100 + index) };
      },
    },
  });
  const positions: Position[] = Array.from({ length: 174 }, (_, index) => [
    -76.9,
    -12 + index / 1000,
  ]);
  const result = await provider.fetchElevations(positions, { requestId: "elevation-1" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.searchParams.get("longitude")?.split(",").length, 100);
  assert.equal(calls[1]?.searchParams.get("latitude")?.split(",").length, 74);
  assert.equal(result.values.length, 174);
  assert.equal(result.values[100], 100);
  assert.deepEqual(
    result.sourceUrls,
    calls.map((url) => url.href),
  );
  assert.equal(provider.source.spatialResolutionM, 90);
});

test.each([
  { elevation: [null] },
  { elevation: [-32768] },
  { elevation: [Infinity] },
  { elevation: [] },
  { height: [12] },
])("rejects changed, missing, or no-data responses", async (payload) => {
  const provider = createOpenMeteoElevationProvider({
    transport: { getJson: async () => payload },
  });
  await assert.rejects(provider.fetchElevations([[-76.9, -12]]), ElevationPayloadError);
});

test("invalid coordinates fail before network access; empty input performs no request", async () => {
  let calls = 0;
  const provider = createOpenMeteoElevationProvider({
    transport: {
      getJson: async () => {
        calls++;
        return {};
      },
    },
  });
  await assert.rejects(provider.fetchElevations([[181, -12]]));
  assert.deepEqual(await provider.fetchElevations([]), { values: [], sourceUrls: [] });
  assert.equal(calls, 0);
});

test.each([
  new HttpTransportError("timeout"),
  new HttpTransportError("http", 500),
  new HttpTransportError("http", 429),
])("propagates %s so callers retain cached data or show unavailable", async (failure) => {
  const provider = createOpenMeteoElevationProvider({
    transport: {
      getJson: async () => {
        throw failure;
      },
    },
  });
  await assert.rejects(provider.fetchElevations([[-76.9, -12]]), (error) => error === failure);
});

test.each([429, 500])(
  "the shared GET wrapper retries HTTP %s for the elevation adapter",
  async (status) => {
    let attempts = 0;
    const provider = createOpenMeteoElevationProvider({
      transport: createFetchJsonTransport({
        fetch: async () => {
          attempts++;
          return attempts === 1
            ? new Response("{}", { status })
            : Response.json({ elevation: [123] });
        },
        sleep: async () => undefined,
        random: () => 0,
        logger: () => undefined,
      }),
    });
    assert.deepEqual((await provider.fetchElevations([[-76.9, -12]])).values, [123]);
    assert.equal(attempts, 2);
  },
);
