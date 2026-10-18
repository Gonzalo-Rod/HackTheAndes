import { z } from "zod";
import { polygonGeometrySchema } from "../../contracts/spatial-inputs.ts";
import type { JsonTransport } from "../http/json-transport.ts";
export const HYDROGRAPHIC_UNITS_URL =
  "https://idesep.senamhi.gob.pe/geoserver/g_00_06/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=g_00_06%3A00_06_001_03_000_000_0000_00_00&outputFormat=application%2Fjson&srsName=EPSG%3A4326&maxFeatures=1000&bbox=-77.1%2C-12.2%2C-75.7%2C-11.3%2CEPSG%3A4326";
export const hydrographicUnitsSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    totalFeatures: z.number().int().nonnegative().max(999),
    features: z.array(
      z.object({
        type: z.literal("Feature"),
        geometry: polygonGeometrySchema,
        properties: z.object({
          codigo: z.string(),
          nombre: z.string(),
          nivel: z.union([z.string(), z.number()]),
        }),
      }),
    ),
  })
  .refine((v) => v.totalFeatures === v.features.length, "Truncated hydrographic units");
export async function fetchHydrographicUnits(transport: JsonTransport, requestId: string) {
  return {
    sourceUrl: HYDROGRAPHIC_UNITS_URL,
    capturedAt: new Date().toISOString(),
    data: hydrographicUnitsSchema.parse(
      await transport.getJson(HYDROGRAPHIC_UNITS_URL, {
        provider: "senamhi-hydrography",
        requestId,
      }),
    ),
  };
}
