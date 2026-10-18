import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { createWarningProvider } from "../../src/integrations/senamhi/warnings.ts";
import { createSusceptibilityProvider } from "../../src/integrations/ingemmet/susceptibility.ts";
import { hazardCaptureSchema } from "../../src/contracts/spatial-inputs.ts";
const source = hazardCaptureSchema.parse(
  JSON.parse(
    gunzipSync(
      await readFile(new URL("../../data/spatial/hazards-source.json.gz", import.meta.url)),
    ).toString("utf8"),
  ),
);
it("preserves unclassified geology instead of treating source class zero as low susceptibility", async () => {
  const provider = createSusceptibilityProvider({
    getJson: async (url) => {
      if (url.endsWith("?f=json"))
        return {
          drawingInfo: {
            renderer: {
              field1: "leyenda",
              uniqueValueInfos: ["Muy Baja", "Baja", "Media", "Alta", "Muy Alta"].map(
                (label, i) => ({ value: String(i + 1), label }),
              ),
            },
          },
        };
      if (url.includes("returnIdsOnly")) return { objectIds: [12] };
      return {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-77, -12],
                  [-76, -12],
                  [-76, -11],
                  [-77, -12],
                ],
              ],
            },
            properties: { objectid: 12, leyenda: 0 },
          },
        ],
      };
    },
  });
  const result = await provider.fetchLayer(
    [
      [-77, -12],
      [-76, -11],
    ],
    [],
    "test",
  );
  expect(result.features[0]?.properties).toMatchObject({ class: 0, label: "Sin clasificar" });
});
it("rejects truncated warnings and avoids using transient feature IDs as stable identity", async () => {
  const first = source.warnings.features[0];
  if (!first) throw new Error("Missing source warning");
  const raw = {
    type: "FeatureCollection",
    totalFeatures: 2,
    crs: { properties: { name: "urn:ogc:def:crs:EPSG::4326" } },
    features: [
      {
        type: "Feature",
        id: "transient",
        geometry: first.geometry,
        properties: {
          gid: 1,
          nivel: "Nivel 2",
          fecha: "2026-10-17Z",
          descripcion: "Example",
          recomendacion: "Example",
        },
      },
    ],
  };
  const provider = createWarningProvider(
    { getJson: async () => raw },
    { getBytes: async () => new TextEncoder().encode("No validity") },
  );
  await expect(provider.fetchLayer("test")).rejects.toThrow("Truncated");
  raw.totalFeatures = 1;
  const result = await provider.fetchLayer("test");
  expect(result.features[0]?.id).toBe("quebrada:2026-10-17:1");
  expect(result.features[0]?.properties.validFrom).toBeNull();
  expect(result.features[0]?.properties.automatedRiskUse).toBe(false);
});
