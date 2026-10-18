import { z } from "zod";

// Static MTC national network served from public/data/red-vial-nacional.geojson (built by data:build).
export const RoadNetworkSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.tuple([z.number(), z.number()])).min(2) }),
      properties: z.object({ road: z.string() }),
    }),
  ),
});
export type RoadNetwork = z.infer<typeof RoadNetworkSchema>;
