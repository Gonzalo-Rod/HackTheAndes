import { z } from "zod";
import type { JsonTransport, JsonRequestOptions } from "../http/json-transport.ts";
import { positionSchema } from "../../contracts/road-geometry.ts";

// Official mapa-24H frontend points at this workspace and layer; product semantics need review.
export const SENAMHI_WARNING_LAYER_URL =
  "https://idesep.senamhi.gob.pe/geoserver/g_prono_pp_24h/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=g_prono_pp_24h%3Aview_aviso24h&outputFormat=application%2Fjson&srsName=EPSG%3A4326&maxFeatures=1000";

const ringSchema = z
  .array(positionSchema)
  .min(4)
  .refine((ring) => {
    const first = ring[0];
    const last = ring.at(-1);
    return first && last && first[0] === last[0] && first[1] === last[1];
  }, "Polygon rings must be closed");
const providerDateSchema = z
  .string()
  .transform((value) => value.replace(/Z$/, ""))
  .pipe(z.iso.date());
const warningLayerSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    totalFeatures: z.number().int().nonnegative(),
    crs: z.object({
      type: z.literal("name"),
      properties: z.object({ name: z.literal("urn:ogc:def:crs:EPSG::4326") }),
    }),
    features: z.array(
      z.object({
        type: z.literal("Feature"),
        id: z.string(),
        geometry: z.object({
          type: z.literal("MultiPolygon"),
          coordinates: z.array(z.array(ringSchema).min(1)).min(1),
        }),
        properties: z.object({
          gid: z.number().int(),
          nivel: z.string(),
          fecha: providerDateSchema,
          descripcio: z.string(),
          recomendac: z.string(),
        }),
      }),
    ),
  })
  .refine((value) => value.features.length === value.totalFeatures, "The layer is truncated");

export class SenamhiWarningLayerError extends Error {
  constructor() {
    super("The SENAMHI warning layer is invalid or incomplete");
    this.name = "SenamhiWarningLayerError";
  }
}

/** Access discovery only: it does not assign hazard types, severity meanings, or validity hours. */
export function createSenamhiWarningAccessProbe({
  transport,
  clock = () => new Date(),
}: {
  transport: JsonTransport;
  clock?: () => Date;
}) {
  return {
    async check(options: JsonRequestOptions = {}) {
      const payload = await transport.getJson(SENAMHI_WARNING_LAYER_URL, {
        ...options,
        provider: "senamhi",
      });
      const parsed = warningLayerSchema.safeParse(payload);
      if (!parsed.success) throw new SenamhiWarningLayerError();
      const records = parsed.data.features;
      return {
        state: "reachable" as const,
        source: "senamhi" as const,
        sourceUrl: SENAMHI_WARNING_LAYER_URL,
        retrievedAt: clock().toISOString(),
        featureCount: records.length,
        complete: true,
        providerDates: [...new Set(records.map((entry) => entry.properties.fecha))].sort(),
        rawLevels: [...new Set(records.map((entry) => entry.properties.nivel))].sort(),
        geometryType: "MultiPolygon",
        crs: "EPSG:4326",
        productSemantics: "unverified",
        automatedRiskUse: false,
      };
    },
  };
}
