import { expect, it } from "vitest";
import { createFetchJsonTransport } from "../../src/integrations/http/json-transport.ts";
import { createBinaryTransport } from "../../src/integrations/http/binary-transport.ts";
import { createSusceptibilityProvider } from "../../src/integrations/ingemmet/susceptibility.ts";
import { createWarningProvider } from "../../src/integrations/senamhi/warnings.ts";
import { fetchHydrographicUnits } from "../../src/integrations/senamhi/hydrographic-units.ts";
import { fetchProviasExport } from "../../src/integrations/provias/export.ts";
const legend = {
  drawingInfo: {
    renderer: {
      field1: "leyenda",
      uniqueValueInfos: ["Muy Baja", "Baja", "Media", "Alta", "Muy Alta"].map((label, i) => ({
        value: String(i + 1),
        label,
      })),
    },
  },
};
const warning = {
  type: "FeatureCollection",
  totalFeatures: 0,
  features: [],
  crs: { properties: { name: "urn:ogc:def:crs:EPSG::4326" } },
};
const polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-77, -12],
      [-76.9, -12],
      [-76.9, -11.9],
      [-77, -12],
    ],
  ],
};
const fixtures = {
  ingemmet: legend,
  senamhi: warning,
  hydrography: {
    type: "FeatureCollection",
    totalFeatures: 1,
    features: [
      {
        type: "Feature",
        geometry: polygon,
        properties: { codigo: "1", nombre: "Example", nivel: 1 },
      },
    ],
  },
};
for (const provider of ["ingemmet", "senamhi", "hydrography", "provias"] as const) {
  it.each([429, 500])(`${provider} respects the retry budget for HTTP %s`, async (status) => {
    let calls = 0;
    const fetchImpl: typeof fetch = async (url) => {
      calls++;
      if (calls < 3) return new Response("Unavailable", { status });
      if (provider === "provias") return new Response(new Uint8Array([0x50, 0x4b, 3, 4]));
      if (provider === "ingemmet" && String(url).includes("returnIdsOnly"))
        return Response.json({ objectIds: [] });
      return Response.json(fixtures[provider]);
    };
    const json = createFetchJsonTransport({
      fetch: fetchImpl,
      sleep: async () => {},
      logger: () => {},
    });
    const binary = createBinaryTransport({
      fetch: fetchImpl,
      sleep: async () => {},
      logger: () => {},
    });
    if (provider === "ingemmet")
      await createSusceptibilityProvider(json).fetchLayer(
        [
          [-77, -12],
          [-76.9, -11.9],
        ],
        [],
        "test",
      );
    if (provider === "senamhi")
      await createWarningProvider(json, {
        getBytes: async () => new TextEncoder().encode("No bulletin period"),
      }).fetchLayer("test");
    if (provider === "hydrography") await fetchHydrographicUnits(json, "test");
    if (provider === "provias") await fetchProviasExport(binary, 2024, "test");
    expect(calls).toBe(provider === "ingemmet" ? 4 : 3);
  });
  it(`${provider} stops after three timed-out attempts`, async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async (_url, options) => {
      calls++;
      return new Promise((_resolve, reject) =>
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
          once: true,
        }),
      );
    };
    const json = createFetchJsonTransport({
      fetch: fetchImpl,
      timeoutMs: 5,
      sleep: async () => {},
      logger: () => {},
    });
    const binary = createBinaryTransport({
      fetch: fetchImpl,
      timeoutMs: 5,
      sleep: async () => {},
      logger: () => {},
    });
    const promise =
      provider === "ingemmet"
        ? createSusceptibilityProvider(json).fetchLayer(
            [
              [-77, -12],
              [-76.9, -11.9],
            ],
            [],
            "test",
          )
        : provider === "senamhi"
          ? createWarningProvider(json, binary).fetchLayer("test")
          : provider === "hydrography"
            ? fetchHydrographicUnits(json, "test")
            : fetchProviasExport(binary, 2024, "test");
    await expect(promise).rejects.toMatchObject({ kind: "timeout" });
    expect(calls).toBe(3);
  });
}
