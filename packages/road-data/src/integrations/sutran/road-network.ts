import { z } from "zod";
import type { JsonTransport, JsonRequestOptions } from "../http/json-transport.ts";
import { roadNetworkSnapshotSchema, roadSectionSchema } from "../../contracts/road-geometry.ts";
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
  constructor() {
    super("The PE-22 road network is invalid or incomplete; existing geometry was preserved");
    this.name = "RoadNetworkPayloadError";
  }
}

export function createSutranRoadNetworkAdapter({
  transport,
  clock = () => new Date(),
}: {
  transport: JsonTransport;
  clock?: () => Date;
}) {
  return {
    async fetchPe22(options: JsonRequestOptions = {}): Promise<RoadNetworkSnapshot> {
      const request = { ...options, provider: "sutran-road-network" };
      const [metadataPayload, geometryPayload] = await Promise.all([
        transport.getJson(ROAD_NETWORK_URLS.metadata, request),
        transport.getJson(ROAD_NETWORK_URLS.geometry, request),
      ]);
      const metadata = envelopeSchema.safeParse(metadataPayload);
      const geometry = collectionSchema.safeParse(geometryPayload);
      if (!metadata.success || !geometry.success) throw new RoadNetworkPayloadError();
      const selected = new Map<string, z.infer<typeof metadataSchema>>();
      for (const raw of metadata.data.data) {
        const identity = identitySchema.safeParse(raw);
        if (!identity.success) throw new RoadNetworkPayloadError();
        if (identity.data.codVia !== "PE-22") continue;
        const parsed = metadataSchema.safeParse(raw);
        if (
          !parsed.success ||
          selected.has(parsed.data.id) ||
          !parsed.data.id.startsWith("PE-22#")
        ) {
          throw new RoadNetworkPayloadError();
        }
        selected.set(parsed.data.id, parsed.data);
      }
      const features: RoadNetworkSnapshot["features"] = [];
      const seen = new Set<string>();
      for (const raw of geometry.data.features) {
        const identity = geometryIdentitySchema.safeParse(raw);
        if (!identity.success) throw new RoadNetworkPayloadError();
        const id = identity.data.properties.id;
        if (!id.startsWith("PE-22#")) continue;
        const row = selected.get(id);
        if (!row || seen.has(id)) throw new RoadNetworkPayloadError();
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
        if (!parsed.success) throw new RoadNetworkPayloadError();
        features.push(parsed.data);
      }
      if (features.length === 0 || seen.size !== selected.size) throw new RoadNetworkPayloadError();
      features.sort((a, b) => a.properties.sourceKmStart - b.properties.sourceKmStart);
      return roadNetworkSnapshotSchema.parse({
        schemaVersion: 1,
        source: "sutran-mtc",
        roadCode: "PE-22",
        retrievedAt: clock().toISOString(),
        sourceUrls: ROAD_NETWORK_URLS,
        receivedMetadataCount: metadata.data.data.length,
        receivedGeometryCount: geometry.data.features.length,
        type: "FeatureCollection",
        features,
      });
    },
  };
}
