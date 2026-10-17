import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createSenamhiWarningAccessProbe,
  SenamhiWarningLayerError,
} from "../../src/integrations/senamhi/warning-access.ts";
import { HttpTransportError } from "../../src/integrations/http/json-transport.ts";

// Synthetic geometry; provider property names and date format match the live response.
function layer() {
  return {
    type: "FeatureCollection",
    totalFeatures: 1,
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::4326" } },
    features: [
      {
        type: "Feature",
        id: "view_aviso24h.example",
        properties: {
          gid: 1,
          nivel: "Nivel 3",
          fecha: "2026-10-17Z",
          descripcio: "Synthetic warning",
          recomendac: "Synthetic recommendation",
        },
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [-77, -12],
                [-76, -12],
                [-76, -11],
                [-77, -12],
              ],
            ],
          ],
        },
      },
    ],
  };
}

test("SENAMHI access validates complete geometry and dates without assigning hazard semantics", async () => {
  const probe = createSenamhiWarningAccessProbe({
    clock: () => new Date("2026-10-17T19:30:00.000Z"),
    transport: {
      getJson: async (_url, options) => {
        assert.equal(options?.requestId, "senamhi-1");
        return layer();
      },
    },
  });
  const summary = await probe.check({ requestId: "senamhi-1" });
  assert.equal(summary.state, "reachable");
  assert.deepEqual(summary.providerDates, ["2026-10-17"]);
  assert.deepEqual(summary.rawLevels, ["Nivel 3"]);
  assert.equal(summary.productSemantics, "unverified");
  assert.equal(summary.automatedRiskUse, false);
  assert.equal("features" in summary, false);
});

test("truncated, malformed, or unclosed warning layers fail validation", async () => {
  for (const kind of ["truncated", "date", "ring", "crs"]) {
    const payload = layer();
    const first = payload.features[0];
    assert.ok(first);
    if (kind === "truncated") payload.totalFeatures = 2;
    if (kind === "date") first.properties.fecha = "2026-02-30Z";
    if (kind === "ring")
      first.geometry.coordinates = [
        [
          [
            [-77, -12],
            [-76, -12],
            [-76, -11],
            [-77, -11],
          ],
        ],
      ];
    if (kind === "crs") payload.crs.properties.name = "EPSG:3857";
    const probe = createSenamhiWarningAccessProbe({ transport: { getJson: async () => payload } });
    await assert.rejects(probe.check(), SenamhiWarningLayerError);
  }
});

test.each([
  new HttpTransportError("timeout"),
  new HttpTransportError("http", 500),
  new HttpTransportError("http", 429),
])("SENAMHI failure %s stays distinguishable from no warnings", async (failure) => {
  const probe = createSenamhiWarningAccessProbe({
    transport: {
      getJson: async () => {
        throw failure;
      },
    },
  });
  await assert.rejects(probe.check(), (error) => error === failure);
});
