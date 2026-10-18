import { z } from "zod";
import type { JsonTransport } from "../http/json-transport.ts";
import type { BinaryTransport } from "../http/binary-transport.ts";
import { polygonGeometrySchema, warningFeatureSchema } from "../../contracts/spatial-inputs.ts";
export const QUEBRADA_WFS_URL =
  "https://idesep.senamhi.gob.pe/geoserver/g_acti_quebrada/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=g_acti_quebrada%3Aview_av_activ_qdra&outputFormat=application%2Fjson&srsName=EPSG%3A4326&maxFeatures=1000";
export const QUEBRADA_BULLETIN_URL = "https://www.senamhi.gob.pe/?p=aviso-activacion-quebrada";
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
export function parseWarningValidity(
  html: string,
): { date: string; validFrom: string; validUntil: string } | null {
  const match = html.match(
    /Fecha de inicio:[\s\S]{0,600}?(\d{1,2})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})\s+-\s+(\d{2}):(\d{2})\s+horas/i,
  );
  if (!match) return null;
  const month = String(MONTHS.indexOf(String(match[2]).toLowerCase()) + 1).padStart(2, "0");
  const date = `${match[3]}-${month}-${String(match[1]).padStart(2, "0")}`;
  const local = `${date}T${match[4]}:${match[5]}:00-05:00`;
  if (!z.iso.datetime({ offset: true }).safeParse(local).success) return null;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&oacute;/g, "ó")
    .replace(/\s+/g, " ");
  if (!/Duración:\s*24\s*hrs/i.test(text)) return null;
  const validFrom = new Date(local).toISOString();
  return {
    date,
    validFrom,
    validUntil: new Date(Date.parse(validFrom) + 24 * 3_600_000).toISOString(),
  };
}
const rawSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    totalFeatures: z.number().int().nonnegative().max(999),
    crs: z.object({ properties: z.object({ name: z.literal("urn:ogc:def:crs:EPSG::4326") }) }),
    features: z.array(
      z.object({
        type: z.literal("Feature"),
        geometry: polygonGeometrySchema,
        properties: z.object({
          gid: z.number().int(),
          nivel: z.enum(["Nivel 1", "Nivel 2", "Nivel 3", "Nivel 4"]),
          fecha: z
            .string()
            .transform((v) => v.replace(/Z$/, " ").trim())
            .pipe(z.iso.date()),
          descripcion: z.string(),
          recomendacion: z.string(),
        }),
      }),
    ),
  })
  .refine((v) => v.totalFeatures === v.features.length, "Truncated SENAMHI layer");
export function createWarningProvider(transport: JsonTransport, textTransport: BinaryTransport) {
  return {
    async fetchLayer(requestId: string) {
      const raw = rawSchema.parse(
        await transport.getJson(QUEBRADA_WFS_URL, { provider: "senamhi", requestId }),
      );
      const html = new TextDecoder("utf8", { fatal: true }).decode(
        await textTransport.getBytes(QUEBRADA_BULLETIN_URL, { provider: "senamhi", requestId }),
      );
      const validity = parseWarningValidity(html);
      const labels = ["Blanco", "Amarillo", "Naranja", "Rojo"] as const;
      const features = raw.features.map((f) =>
        warningFeatureSchema.parse({
          type: "Feature",
          id: `quebrada:${f.properties.fecha}:${f.properties.gid}`,
          geometry: f.geometry,
          properties: {
            provider: "senamhi",
            product: "quebrada_activation",
            rawLevel: f.properties.nivel,
            label: labels[Number(f.properties.nivel.slice(-1)) - 1],
            providerDate: f.properties.fecha,
            description: f.properties.descripcion,
            recommendation: f.properties.recomendacion,
            validFrom: validity?.date === f.properties.fecha ? validity.validFrom : null,
            validUntil: validity?.date === f.properties.fecha ? validity.validUntil : null,
            validityBasis: "bulletin_local_time_assumed_America_Lima",
            automatedRiskUse: false,
          },
        }),
      );
      if (new Set(features.map((f) => f.id)).size !== features.length)
        throw new Error("Duplicate SENAMHI identities");
      return {
        type: "FeatureCollection" as const,
        features,
        sourceUrls: [
          QUEBRADA_WFS_URL,
          QUEBRADA_BULLETIN_URL,
          "https://www.senamhi.gob.pe/mapas/mapa-quebradas/",
        ],
        nationalFeatureCount: features.length,
        productSemantics: "verified_against_official_map" as const,
      };
    },
  };
}
