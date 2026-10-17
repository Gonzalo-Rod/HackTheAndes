import { z } from "zod";
import { positionSchema } from "./road-geometry.ts";

// The Team Plan requires rejecting report pins more than 500 m from PE-22.
export const MAX_ROAD_OFFSET_M = 500;
export const placeQuerySchema = z.string().trim().min(1).max(200);
export const landmarkSchema = z.object({
  sourceId: z.string().min(1),
  kind: z.enum(["bridge", "sos", "toll"]),
  name: z.string().trim(),
  aliases: z.array(z.string().trim().min(1)),
  position: positionSchema,
  reportedRoadCode: z.literal("PE-22").nullable(),
  reportedKm: z.number().nonnegative().nullable(),
  sourceUrl: z.url(),
});
export const landmarkSourceSchema = z
  .object({
    schemaVersion: z.literal(1),
    provider: z.literal("mtc-ign"),
    retrievedAt: z.iso.datetime({ offset: true }),
    sourceUrls: z.array(z.url()).length(3),
    landmarks: z.array(landmarkSchema).max(3_000),
  })
  .superRefine((source, context) => {
    const ids = new Set<string>();
    for (const [index, row] of source.landmarks.entries()) {
      if (ids.has(row.sourceId) || !source.sourceUrls.includes(row.sourceUrl))
        context.addIssue({
          code: "custom",
          path: ["landmarks", index],
          message: "Duplicate identity or unknown source URL",
        });
      ids.add(row.sourceId);
    }
  });
export const roadLocationSchema = z.object({
  geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
  segmentId: z.string().min(1),
  snappedPosition: positionSchema,
  distanceFromOriginKm: z.number().nonnegative(),
  distanceFromRoadM: z.number().min(0).max(MAX_ROAD_OFFSET_M),
});
export const gazetteerEntrySchema = landmarkSchema.extend({
  location: roadLocationSchema,
  officialKm: z.null(),
  verified: z.literal(false),
});
export const gazetteerSchema = z.object({
  schemaVersion: z.literal(1),
  geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
  source: landmarkSourceSchema,
  entries: z.array(gazetteerEntrySchema).max(3_000),
  excluded: z.array(
    z.object({ sourceId: z.string(), reason: z.enum(["unnamed", "outside_corridor"]) }),
  ),
  kilometerEvidence: z.object({
    state: z.literal("unverified"),
    anchors: z.array(
      z.object({
        sourceId: z.string(),
        reportedKm: z.number().nonnegative(),
        distanceFromOriginKm: z.number().nonnegative(),
        offsetKm: z.number(),
      }),
    ),
  }),
});
export type LandmarkSource = z.infer<typeof landmarkSourceSchema>;
export type Gazetteer = z.infer<typeof gazetteerSchema>;
export type GazetteerEntry = z.infer<typeof gazetteerEntrySchema>;
export type RoadLocation = z.infer<typeof roadLocationSchema>;
export type LocationResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code:
          | "invalid_geometry"
          | "invalid_position"
          | "outside_corridor"
          | "invalid_source"
          | "invalid_snapshot"
          | "unknown_revision";
        message: string;
      };
    };
export interface LandmarkProvider {
  fetchLandmarks(options?: { requestId?: string; signal?: AbortSignal }): Promise<LandmarkSource>;
}
