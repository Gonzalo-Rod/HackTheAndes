import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createSutranRoadNetworkAdapter,
  ROAD_NETWORK_URLS,
  RoadNetworkPayloadError,
} from "../../src/integrations/sutran/road-network.ts";
import { HttpTransportError } from "../../src/integrations/http/json-transport.ts";
import { providerPayloads } from "./support.ts";

test("the road adapter joins geometry to metadata by ID and propagates request correlation", async () => {
  const payloads = providerPayloads();
  const calls: string[] = [];
  const adapter = createSutranRoadNetworkAdapter({
    clock: () => new Date("2026-10-17T19:30:00.000Z"),
    transport: {
      getJson: async (url, options) => {
        calls.push(url);
        assert.equal(options?.requestId, "geometry-1");
        return url === ROAD_NETWORK_URLS.metadata ? payloads.metadata : payloads.geometry;
      },
    },
  });
  const result = await adapter.fetchPe22({ requestId: "geometry-1" });
  assert.equal(result.features.length, 32);
  assert.equal(result.features[0]?.properties.sourceKmStart, 0);
  assert.equal(result.retrievedAt, "2026-10-17T19:30:00.000Z");
  assert.equal(calls.length, 2);
});

test("a missing geometry join or duplicate ID rejects the whole network", async () => {
  for (const kind of ["missing", "duplicate"]) {
    const payloads = providerPayloads();
    if (kind === "missing") payloads.geometry.features.pop();
    else {
      const first = payloads.geometry.features[0];
      assert.ok(first);
      payloads.geometry.features.push(first);
    }
    const adapter = createSutranRoadNetworkAdapter({
      transport: {
        getJson: async (url) =>
          url === ROAD_NETWORK_URLS.metadata ? payloads.metadata : payloads.geometry,
      },
    });
    await assert.rejects(adapter.fetchPe22(), RoadNetworkPayloadError);
  }
});

test("a changed envelope or invalid coordinate cannot produce a ready dataset", async () => {
  const payloads = providerPayloads();
  const first = payloads.geometry.features[0];
  assert.ok(first);
  first.geometry = {
    type: "LineString",
    coordinates: [
      [181, -12],
      [-76.8, -12],
    ],
  };
  const adapter = createSutranRoadNetworkAdapter({
    transport: {
      getJson: async (url) =>
        url === ROAD_NETWORK_URLS.metadata ? payloads.metadata : payloads.geometry,
    },
  });
  await assert.rejects(adapter.fetchPe22(), RoadNetworkPayloadError);
  const changed = createSutranRoadNetworkAdapter({
    transport: { getJson: async () => ({ success: false, data: [] }) },
  });
  await assert.rejects(changed.fetchPe22(), RoadNetworkPayloadError);
});

test.each([
  new HttpTransportError("timeout"),
  new HttpTransportError("http", 500),
  new HttpTransportError("http", 429),
])("road transport failure %s propagates for an explicit unavailable state", async (failure) => {
  const adapter = createSutranRoadNetworkAdapter({
    transport: {
      getJson: async () => {
        throw failure;
      },
    },
  });
  await assert.rejects(adapter.fetchPe22(), (error) => error === failure);
});
