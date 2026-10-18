import { z } from "zod";
import type { JsonTransport, JsonRequestOptions } from "../http/json-transport.ts";
import {
  roadCodeSchema,
  roadNetworkSnapshotSchema,
  roadSectionSchema,
} from "../../contracts/road-geometry.ts";
import type { RoadNetworkSnapshot } from "../../contracts/road-geometry.ts";
import { SUTRAN_BASE_URL } from "./adapter.ts";

export const ROAD_NETWORK_URLS = {
  metadata: `${SUTRAN_BASE_URL}road-network/segments?red=nacional`,
  geometry: "https://d27ijeauab3idp.cloudfront.net/red-vial-nacional.geojson",
} as const;

const envelopeSchema = z.object({ success: z.literal(true), data: z.array(z.unknown()) });
const collectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.unknown()),
});
const identitySchema = z.object({ id: z.string().min(1), codVia: z.string() });
const metadataSchema = identitySchema.extend({
  kmInicio: z.number().nonnegative(),
  kmFin: z.number().positive(),
  longitudKm: z.number().positive(),
  red: z.literal("nacional"),
  nombreVia: z.string(),
  superficie: z.string(),
  estado: z.string(),
});
const geometryIdentitySchema = z.object({
  type: z.literal("Feature"),
  properties: z.object({ id: z.string().min(1) }),
  geometry: z.unknown(),
});

export class RoadNetworkPayloadError extends Error {
  constructor(roadCode: string) {
    super(`The ${roadCode} road network is invalid or incomplete; existing geometry was preserved`);
    this.name = "RoadNetworkPayloadError";
  }
}

export type RoadSelection = { ok: true; value: RoadNetworkSnapshot } | { ok: false; error: string };

type NetworkPayloads = {
  metadata: z.infer<typeof envelopeSchema>;
  geometry: z.infer<typeof collectionSchema>;
  retrievedAt: string;
};

function selectRoad(payloads: NetworkPayloads, code: string): RoadNetworkSnapshot {
  const roadCode = roadCodeSchema.parse(code);
  const invalid = () => new RoadNetworkPayloadError(roadCode);
  const selected = new Map<string, z.infer<typeof metadataSchema>>();
  for (const raw of payloads.metadata.data) {
    const identity = identitySchema.safeParse(raw);
    if (!identity.success) throw invalid();
    if (identity.data.codVia !== roadCode) continue;
    const parsed = metadataSchema.safeParse(raw);
    if (
      !parsed.success ||
      selected.has(parsed.data.id) ||
      !parsed.data.id.startsWith(`${roadCode}#`)
    ) {
      throw invalid();
    }
    selected.set(parsed.data.id, parsed.data);
  }
  const features: RoadNetworkSnapshot["features"] = [];
  const seen = new Set<string>();
  for (const raw of payloads.geometry.features) {
    const identity = geometryIdentitySchema.safeParse(raw);
    if (!identity.success) throw invalid();
    const id = identity.data.properties.id;
    // The "#" separator keeps PE-1N from matching PE-1NI sections.
    if (!id.startsWith(`${roadCode}#`)) continue;
    const row = selected.get(id);
    if (!row || seen.has(id)) throw invalid();
    seen.add(id);
    const parsed = roadSectionSchema.safeParse({
      type: "Feature",
      geometry: identity.data.geometry,
      properties: {
        sourceId: row.id,
        roadCode: row.codVia,
        sourceKmStart: row.kmInicio,
        sourceKmEnd: row.kmFin,
        sourceLengthKm: row.longitudKm,
        name: row.nombreVia,
        surface: row.superficie,
        condition: row.estado,
      },
    });
    if (!parsed.success) throw invalid();
    features.push(parsed.data);
  }
  if (features.length === 0 || seen.size !== selected.size) throw invalid();
  features.sort((a, b) => a.properties.sourceKmStart - b.properties.sourceKmStart);
  return roadNetworkSnapshotSchema.parse({
    schemaVersion: 1,
    source: "sutran-mtc",
    roadCode,
    retrievedAt: payloads.retrievedAt,
    sourceUrls: ROAD_NETWORK_URLS,
    receivedMetadataCount: payloads.metadata.data.length,
    receivedGeometryCount: payloads.geometry.features.length,
    type: "FeatureCollection",
    features,
  });
}

export function createSutranRoadNetworkAdapter({
  transport,
  clock = () => new Date(),
}: {
  transport: JsonTransport;
  clock?: () => Date;
}) {
  async function fetchNetwork(options: JsonRequestOptions): Promise<NetworkPayloads> {
    const request = { ...options, provider: "sutran-road-network" };
    const [metadataPayload, geometryPayload] = await Promise.all([
      transport.getJson(ROAD_NETWORK_URLS.metadata, request),
      transport.getJson(ROAD_NETWORK_URLS.geometry, request),
    ]);
    const metadata = envelopeSchema.safeParse(metadataPayload);
    const geometry = collectionSchema.safeParse(geometryPayload);
    if (!metadata.success || !geometry.success) throw new RoadNetworkPayloadError("national");
    return { metadata: metadata.data, geometry: geometry.data, retrievedAt: clock().toISOString() };
  }
  return {
    async fetchRoad(code: string, options: JsonRequestOptions = {}): Promise<RoadNetworkSnapshot> {
      return selectRoad(await fetchNetwork(options), code);
    },
    /** Downloads the national files once; each road is selected locally by its MTC code. */
    async fetchRoads(
      codes: readonly string[],
      options: JsonRequestOptions = {},
    ): Promise<Map<string, RoadSelection>> {
      const payloads = await fetchNetwork(options);
      const selections = new Map<string, RoadSelection>();
      for (const code of codes) {
        try {
          selections.set(code, { ok: true, value: selectRoad(payloads, code) });
        } catch (error) {
          // One malformed road must not block the others; anything else is a bug.
          if (!(error instanceof RoadNetworkPayloadError || error instanceof z.ZodError))
            throw error;
          selections.set(code, { ok: false, error: error.message });
        }
      }
      return selections;
    },
    /** Every national road code in the current metadata, sorted. */
    async listRoadCodes(options: JsonRequestOptions = {}): Promise<string[]> {
      const payloads = await fetchNetwork(options);
      const codes = new Set<string>();
      for (const raw of payloads.metadata.data) {
        const identity = identitySchema.safeParse(raw);
        if (identity.success && roadCodeSchema.safeParse(identity.data.codVia).success)
          codes.add(identity.data.codVia);
      }
      return [...codes].sort();
    },
  };
}
