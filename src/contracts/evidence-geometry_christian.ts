import { z } from "zod";

export const EvidenceCoordinatesSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const RingSchema = z
  .array(EvidenceCoordinatesSchema)
  .min(4)
  .refine((ring) => {
    const first = ring[0];
    const last = ring[ring.length - 1];
    return first[0] === last[0] && first[1] === last[1];
  }, "Polygon rings must be closed");
const PolygonCoordinatesSchema = z.array(RingSchema).min(1);

export const EvidenceGeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: EvidenceCoordinatesSchema }),
  z.object({ type: z.literal("Polygon"), coordinates: PolygonCoordinatesSchema }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(PolygonCoordinatesSchema).min(1) }),
]);
export type EvidenceGeometry = z.infer<typeof EvidenceGeometrySchema>;
