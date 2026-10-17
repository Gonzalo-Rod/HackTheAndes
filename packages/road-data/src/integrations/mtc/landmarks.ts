import { z } from "zod";
import { positionSchema } from "../../contracts/road-geometry.ts";
import {
  landmarkSourceSchema,
  type LandmarkSource,
  type LandmarkProvider,
} from "../../contracts/road-locations.ts";
import type { JsonTransport } from "../http/json-transport.ts";

export const MTC_MAP_URL =
  "https://www.idep.gob.pe/geoportal/rest/services/INSTITUCIONALES/MTC/MapServer";
// A deliberately bounded query around the captured Lima–La Oroya corridor; precise filtering is 500 m.
const BRIDGE_QUERY_ENVELOPE = "-77.01,-12.06,-75.88,-11.49";
const MAX_QUERY_RECORDS = 1000;
const featureSchema = z.object({
  type: z.literal("Feature"),
  id: z.number().int().nonnegative(),
  properties: z.unknown(),
  geometry: z.union([
    z.object({ type: z.literal("Point"), coordinates: positionSchema }),
    z.object({ type: z.literal("MultiPoint"), coordinates: z.array(positionSchema).length(1) }),
  ]),
});
const collectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(featureSchema).max(MAX_QUERY_RECORDS - 1),
  exceededTransferLimit: z.literal(false).optional(),
});
const bridgeSchema = z.object({
  NombrePuen: z.string(),
  KmInicio: z.number().nonnegative().nullable(),
});
const sosSchema = z.object({
  numPoste: z.string().trim().min(1),
  codRuta: z.literal("PE-22"),
  kmInicio: z.number().nonnegative().nullable(),
});
const tollSchema = z.object({
  nombre: z.string().trim().min(1),
  ruta: z.literal("PE-22"),
  inicio: z.number().nonnegative().nullable(),
});

export class LandmarkPayloadError extends Error {
  constructor() {
    super("MTC landmarks are invalid or truncated; retain the previous verified snapshot");
    this.name = "LandmarkPayloadError";
  }
}
export function landmarkQueryUrl(layer: 5 | 6 | 7): string {
  const url = new URL(`${MTC_MAP_URL}/${layer}/query`);
  const where = layer === 5 ? "ruta = 'PE-22'" : layer === 6 ? "codRuta = 'PE-22'" : "1=1";
  const fields =
    layer === 5
      ? "OBJECTID,nombre,ruta,inicio"
      : layer === 6
        ? "OBJECTID_1,numPoste,codRuta,kmInicio"
        : "OBJECTID,NombrePuen,KmInicio";
  for (const [key, value] of Object.entries({
    where,
    outFields: fields,
    outSR: "4326",
    f: "geojson",
    returnGeometry: "true",
    resultRecordCount: String(MAX_QUERY_RECORDS),
  }))
    url.searchParams.set(key, value);
  if (layer === 7)
    for (const [key, value] of Object.entries({
      geometry: BRIDGE_QUERY_ENVELOPE,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
    }))
      url.searchParams.set(key, value);
  return url.href;
}
export function createMtcLandmarkProvider({
  transport,
  clock = () => new Date(),
}: {
  transport: JsonTransport;
  clock?: () => Date;
}): LandmarkProvider {
  return {
    async fetchLandmarks(options = {}) {
      const landmarks: LandmarkSource["landmarks"] = [];
      const sourceUrls: string[] = [];
      for (const layer of [5, 6, 7] as const) {
        const sourceUrl = landmarkQueryUrl(layer);
        const parsed = collectionSchema.safeParse(
          await transport.getJson(sourceUrl, { ...options, provider: "mtc-ign-landmarks" }),
        );
        if (!parsed.success || !parsed.data.features.length) throw new LandmarkPayloadError();
        sourceUrls.push(sourceUrl);
        for (const row of parsed.data.features) {
          const position = positionSchema.parse(
            row.geometry.type === "Point" ? row.geometry.coordinates : row.geometry.coordinates[0],
          );
          const common = { sourceId: `${layer}:${row.id}`, position, sourceUrl };
          const bridge = layer === 7 ? bridgeSchema.safeParse(row.properties) : undefined;
          const sos = layer === 6 ? sosSchema.safeParse(row.properties) : undefined;
          const toll = layer === 5 ? tollSchema.safeParse(row.properties) : undefined;
          if (bridge?.success)
            landmarks.push({
              ...common,
              kind: "bridge",
              name: bridge.data.NombrePuen,
              aliases: [`Puente ${bridge.data.NombrePuen}`],
              reportedRoadCode: null,
              reportedKm: bridge.data.KmInicio,
            });
          else if (sos?.success)
            landmarks.push({
              ...common,
              kind: "sos",
              name: `Poste SOS ${sos.data.numPoste}`,
              aliases: [`SOS ${sos.data.numPoste}`],
              reportedRoadCode: "PE-22",
              reportedKm: sos.data.kmInicio,
            });
          else if (toll?.success)
            landmarks.push({
              ...common,
              kind: "toll",
              name: `Peaje ${toll.data.nombre}`,
              aliases: [toll.data.nombre],
              reportedRoadCode: "PE-22",
              reportedKm: toll.data.inicio,
            });
          else throw new LandmarkPayloadError();
        }
      }
      const snapshot = landmarkSourceSchema.safeParse({
        schemaVersion: 1,
        provider: "mtc-ign",
        retrievedAt: clock().toISOString(),
        sourceUrls,
        landmarks,
      });
      if (!snapshot.success) throw new LandmarkPayloadError();
      return snapshot.data;
    },
  };
}
