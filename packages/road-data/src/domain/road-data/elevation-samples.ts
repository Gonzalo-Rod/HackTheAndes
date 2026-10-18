import { length } from "@turf/length";
import { lineSliceAlong } from "@turf/line-slice-along";
import { displaySegmentsSchema, positionSchema } from "../../contracts/road-geometry.ts";
import type {
  ElevationResult,
  ElevationSamplePoint,
  ElevationSnapshot,
} from "../../contracts/road-elevation.ts";
import { MAX_ELEVATION_SAMPLES, elevationSnapshotSchema } from "../../contracts/road-elevation.ts";

interface ElevationSamplePlan {
  geometryRevision: string;
  samples: ElevationSamplePoint[];
}

export function planElevationSamples(input: unknown): ElevationResult<ElevationSamplePlan> {
  const parsed = displaySegmentsSchema.safeParse(input);
  const first = parsed.success ? parsed.data.features[0] : undefined;
  if (!parsed.success || !first || parsed.data.features.length > MAX_ELEVATION_SAMPLES) {
    return {
      ok: false,
      error: {
        code: "invalid_segments",
        message: "A bounded, valid segment collection is required",
      },
    };
  }
  const geometryRevision = first.properties.geometryRevision;
  const samples: ElevationSamplePoint[] = [];
  const ids = new Set<string>();
  for (const segment of parsed.data.features) {
    if (segment.properties.distanceFromOriginEndKm <= segment.properties.distanceFromOriginStartKm)
      return {
        ok: false,
        error: { code: "invalid_segments", message: "A segment's distance range must increase" },
      };
    if (segment.properties.geometryRevision !== geometryRevision)
      return {
        ok: false,
        error: {
          code: "mixed_geometry_revisions",
          message: "Elevation samples must use one geometry revision",
        },
      };
    if (ids.has(segment.id))
      return {
        ok: false,
        error: {
          code: "duplicate_segment",
          message: "A segment can have only one midpoint sample",
        },
      };
    ids.add(segment.id);
    const measuredLengthKm = length(segment, { units: "kilometers" });
    if (measuredLengthKm <= 0)
      return {
        ok: false,
        error: { code: "zero_length_segment", message: "Cannot sample a zero-length segment" },
      };
    // Slice by geodesic distance: averaging endpoints can place the sample off a curved road.
    const half = lineSliceAlong(segment.geometry, 0, measuredLengthKm / 2, { units: "kilometers" });
    const position = positionSchema.parse(half.geometry.coordinates.at(-1));
    samples.push({
      segmentId: segment.id,
      position,
      distanceFromOriginKm:
        (segment.properties.distanceFromOriginStartKm +
          segment.properties.distanceFromOriginEndKm) /
        2,
    });
  }
  return { ok: true, value: { geometryRevision, samples } };
}

export function validateElevationSnapshot(
  input: unknown,
  plan: ElevationSamplePlan,
): ElevationResult<ElevationSnapshot> {
  const parsed = elevationSnapshotSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "invalid_snapshot", message: "Elevation snapshot failed validation" },
    };
  const snapshot = parsed.data;
  if (
    snapshot.geometryRevision !== plan.geometryRevision ||
    snapshot.samples.length !== plan.samples.length
  )
    return {
      ok: false,
      error: {
        code: "incomplete_coverage",
        message: "Elevation snapshot must cover the current geometry revision",
      },
    };
  if (
    snapshot.samples.some((sample, index) => {
      const expected = plan.samples[index];
      return (
        !expected ||
        sample.segmentId !== expected.segmentId ||
        sample.position[0] !== expected.position[0] ||
        sample.position[1] !== expected.position[1] ||
        sample.distanceFromOriginKm !== expected.distanceFromOriginKm
      );
    })
  )
    return {
      ok: false,
      error: {
        code: "off_road_sample",
        message: "Elevation snapshot does not match the current sampling plan",
      },
    };
  return { ok: true, value: snapshot };
}
