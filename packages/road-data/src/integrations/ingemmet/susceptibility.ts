import { z } from "zod";
import type { JsonTransport } from "../http/json-transport.ts";
import {
  polygonGeometrySchema,
  susceptibilityFeatureSchema,
} from "../../contracts/spatial-inputs.ts";
import type { Position } from "../../contracts/road-geometry.ts";
const BASE =
  "https://geocatminnube.ingemmet.gob.pe/arcgis/rest/services/SERV_SUSCEPTIBLE_MOV_MASA_REGIONAL/MapServer/1";
const LABELS = ["Muy Baja", "Baja", "Media", "Alta", "Muy Alta"] as const;
const idsSchema = z.object({ objectIds: z.array(z.number().int().nonnegative()).max(100_000) });
const resultSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      geometry: polygonGeometrySchema,
      properties: z.object({
        objectid: z.number().int().nonnegative(),
        leyenda: z.number().int().min(0).max(5),
      }),
    }),
  ),
  exceededTransferLimit: z.boolean().optional(),
});
export function createSusceptibilityProvider(transport: JsonTransport) {
  return {
    async fetchLayer(road: Position[], samples: Position[], requestId: string) {
      const sourceUrls: string[] = [];
      const identifiers = new Set<number>();
      const metadata = z
        .object({
          drawingInfo: z.object({
            renderer: z.object({
              field1: z.literal("leyenda"),
              uniqueValueInfos: z.array(z.object({ value: z.string(), label: z.string() })),
            }),
          }),
        })
        .parse(await transport.getJson(`${BASE}?f=json`, { provider: "ingemmet", requestId }));
      if (
        LABELS.some(
          (label, i) =>
            !metadata.drawingInfo.renderer.uniqueValueInfos.some(
              (v) => v.value === String(i + 1) && v.label === label,
            ),
        )
      )
        throw new Error("INGEMMET legend changed");
      const geometries: { type: string; value: unknown }[] = [];
      // Overlap endpoints so no part of the actual road axis disappears between queries.
      for (let offset = 0; offset < road.length - 1; offset += 79)
        geometries.push({
          type: "esriGeometryPolyline",
          value: { paths: [road.slice(offset, offset + 80)], spatialReference: { wkid: 4326 } },
        });
      for (let offset = 0; offset < samples.length; offset += 30)
        geometries.push({
          type: "esriGeometryMultipoint",
          value: { points: samples.slice(offset, offset + 30), spatialReference: { wkid: 4326 } },
        });
      for (const geometry of geometries) {
        const params = new URLSearchParams({
          f: "json",
          where: "1=1",
          geometry: JSON.stringify(geometry.value),
          geometryType: geometry.type,
          inSR: "4326",
          spatialRel: "esriSpatialRelIntersects",
          returnIdsOnly: "true",
        });
        const url = `${BASE}/query?${params}`;
        const response = idsSchema.parse(
          await transport.getJson(url, { provider: "ingemmet", requestId }),
        );
        response.objectIds.forEach((id) => identifiers.add(id));
        sourceUrls.push(url);
      }
      const features = [];
      const ids = [...identifiers].sort((a, b) => a - b);
      for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100);
        const params = new URLSearchParams({
          f: "geojson",
          objectIds: batch.join(","),
          outFields: "objectid,leyenda",
          outSR: "4326",
          returnGeometry: "true",
          geometryPrecision: "6",
        });
        const url = `${BASE}/query?${params}`;
        const response = resultSchema.parse(
          await transport.getJson(url, { provider: "ingemmet", requestId }),
        );
        if (
          response.exceededTransferLimit ||
          response.features.length !== batch.length ||
          response.features.some((f) => !batch.includes(f.properties.objectid)) ||
          new Set(response.features.map((f) => f.properties.objectid)).size !== batch.length
        )
          throw new Error("Incomplete susceptibility polygon response");
        features.push(
          ...response.features.map((f) =>
            susceptibilityFeatureSchema.parse({
              type: "Feature",
              id: f.properties.objectid,
              geometry: f.geometry,
              properties: {
                provider: "ingemmet",
                class: f.properties.leyenda,
                label:
                  f.properties.leyenda === 0 ? "Sin clasificar" : LABELS[f.properties.leyenda - 1],
              },
            }),
          ),
        );
        sourceUrls.push(url);
      }
      return {
        type: "FeatureCollection" as const,
        features,
        sourceUrls,
        sourcePublishedAt: null,
        historicalEligibility: "unverified" as const,
        queryCoverage: "road_axis_and_catchment_sampling_points" as const,
      };
    },
  };
}
