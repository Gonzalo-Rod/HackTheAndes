import { z } from "zod";

// Contract for public/data/pe22.json, produced by scripts/build-static-layers.ts and
// read by the dashboard. Line vertices are [lng, lat, km along the MTC geometry].

export const MeasuredVertexSchema = z.tuple([z.number(), z.number(), z.number()]);

export const CorridorPlaceSchema = z.object({
  name: z.string(),
  km: z.number(),
  lng: z.number(),
  lat: z.number(),
  offsetKm: z.number(),
  elevationM: z.number(),
});

export const CorridorDataSchema = z.object({
  road: z.string(),
  name: z.string(),
  kmTotal: z.number().positive(),
  line: z.array(MeasuredVertexSchema).min(2),
  segments: z.array(z.object({ kmStart: z.number(), kmEnd: z.number(), surface: z.string(), condition: z.string() })),
  kmMarkers: z.array(z.object({ km: z.number(), lng: z.number(), lat: z.number() })),
  places: z.array(CorridorPlaceSchema),
  profile: z.array(z.object({ km: z.number(), elevationM: z.number() })).min(2),
  metadata: z.object({
    retrievedAt: z.string(),
    state: z.enum(["database", "snapshot"]).optional(),
    geometryRevision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    message: z.string().optional(),
    geometry: z.string(),
    elevation: z.string(),
    places: z.string(),
    attribution: z.array(z.string()),
  }),
});

export type MeasuredVertex = z.infer<typeof MeasuredVertexSchema>;
export type CorridorPlace = z.infer<typeof CorridorPlaceSchema>;
export type CorridorData = z.infer<typeof CorridorDataSchema>;
