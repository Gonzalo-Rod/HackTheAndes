import { z } from "zod";

export const positionSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export const lineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(positionSchema).min(2),
});
export const multiLineStringSchema = z.object({
  type: z.literal("MultiLineString"),
  coordinates: z.array(z.array(positionSchema).min(2)).min(1),
});
export const roadSectionSchema = z.object({
  type: z.literal("Feature"),
  properties: z
    .object({
      sourceId: z.string().min(1),
      roadCode: z.literal("PE-22"),
      sourceKmStart: z.number().nonnegative(),
      sourceKmEnd: z.number().positive(),
      sourceLengthKm: z.number().positive(),
      name: z.string(),
      surface: z.string(),
      condition: z.string(),
    })
    .refine((value) => value.sourceKmEnd > value.sourceKmStart, "Invalid source kilometer range"),
  geometry: z.union([lineStringSchema, multiLineStringSchema]),
});

export const roadNetworkSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal("sutran-mtc"),
  roadCode: z.literal("PE-22"),
  retrievedAt: z.iso.datetime({ offset: true }),
  sourceUrls: z.object({ metadata: z.url(), geometry: z.url() }),
  receivedMetadataCount: z.number().int().nonnegative(),
  receivedGeometryCount: z.number().int().nonnegative(),
  type: z.literal("FeatureCollection"),
  features: z.array(roadSectionSchema).min(1),
});

const sourceReferenceSchema = z.object({
  sourceId: z.string(),
  sourceKmStart: z.number(),
  sourceKmEnd: z.number(),
});
export const displaySegmentSchema = z.object({
  type: z.literal("Feature"),
  id: z.string(),
  properties: z.object({
    roadCode: z.literal("PE-22"),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
    distanceFromOriginStartKm: z.number().nonnegative(),
    distanceFromOriginEndKm: z.number().positive(),
    lengthKm: z.number().positive(),
    sourceReferences: z.array(sourceReferenceSchema).min(1),
    kilometerCalibration: z.literal("unverified"),
    officialKmStart: z.null(),
    officialKmEnd: z.null(),
    elevationM: z.null(),
  }),
  geometry: lineStringSchema,
});
export const displaySegmentsSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(displaySegmentSchema).min(1),
});

export type Position = z.infer<typeof positionSchema>;
export type RoadSection = z.infer<typeof roadSectionSchema>;
export type RoadNetworkSnapshot = z.infer<typeof roadNetworkSnapshotSchema>;
export type DisplaySegment = z.infer<typeof displaySegmentSchema>;
export type DisplaySegments = z.infer<typeof displaySegmentsSchema>;

export interface GeometryDiagnostic {
  sourceId: string;
  sourceLengthKm: number;
  measuredLengthKm: number;
  lengthDifferenceKm: number;
}

export interface CorridorBuild {
  corridor: {
    type: "Feature";
    properties: { roadCode: "PE-22"; geometryRevision: string; measuredLengthKm: number };
    geometry: z.infer<typeof lineStringSchema>;
  };
  segments: DisplaySegments;
  diagnostics: GeometryDiagnostic[];
}

export type CorridorBuildResult =
  | { ok: true; value: CorridorBuild }
  | {
      ok: false;
      error: {
        code:
          | "invalid_snapshot"
          | "duplicate_section"
          | "disconnected_geometry"
          | "invalid_chainage"
          | "zero_length_geometry"
          | "too_many_segments";
        message: string;
      };
    };
