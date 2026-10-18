import { nearestPointOnLine } from "@turf/nearest-point-on-line";
import { length } from "@turf/length";
import { displaySegmentsSchema, positionSchema } from "../../contracts/road-geometry.ts";
import {
  MAX_ROAD_OFFSET_M,
  roadLocationSchema,
  type LocationResult,
  type RoadLocation,
} from "../../contracts/road-locations.ts";

// Resolve shared-endpoint ties without treating visibly separate positions as equal.
const PROJECTION_TIE_TOLERANCE_M = 1e-6;

function joinsPrevious(
  previous: { geometry: { coordinates: [number, number][] } } | undefined,
  current: { geometry: { coordinates: [number, number][] } },
): boolean {
  if (!previous) return true;
  const end = previous.geometry.coordinates.at(-1);
  const start = current.geometry.coordinates[0];
  return !!end && !!start && end[0] === start[0] && end[1] === start[1];
}

export function createRoadLocator(input: unknown): LocationResult<{
  geometryRevision: string;
  locate(position: unknown): LocationResult<RoadLocation>;
}> {
  const parsed = displaySegmentsSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "invalid_geometry", message: "Valid road segments are required" },
    };
  const features = parsed.data.features;
  const first = features[0];
  const ids = new Set(features.map((segment) => segment.id));
  if (
    !first ||
    ids.size !== features.length ||
    first.properties.distanceFromOriginStartKm !== 0 ||
    features.some(
      (segment, index) =>
        segment.properties.geometryRevision !== first.properties.geometryRevision ||
        segment.properties.distanceFromOriginEndKm <=
          segment.properties.distanceFromOriginStartKm ||
        length(segment, { units: "kilometers" }) <= 0 ||
        !joinsPrevious(features[index - 1], segment) ||
        (index > 0 &&
          features[index - 1]?.properties.distanceFromOriginEndKm !==
            segment.properties.distanceFromOriginStartKm),
    )
  )
    return {
      ok: false,
      error: {
        code: "invalid_geometry",
        message: "Segments must be ordered, unique, and from one continuous revision",
      },
    };
  const geometryRevision = first.properties.geometryRevision;
  return {
    ok: true,
    value: {
      geometryRevision,
      locate(inputPosition) {
        const position = positionSchema.safeParse(inputPosition);
        if (!position.success)
          return {
            ok: false,
            error: { code: "invalid_position", message: "A longitude/latitude pair is required" },
          };
        let nearest: RoadLocation | undefined;
        for (const segment of features) {
          const projected = nearestPointOnLine(segment, position.data, { units: "kilometers" });
          const distanceFromRoadM = projected.properties.pointDistance * 1000;
          if (distanceFromRoadM > MAX_ROAD_OFFSET_M) continue;
          // Shared endpoints belong to the later segment; tolerate only sub-millimeter roundoff.
          if (nearest && distanceFromRoadM > nearest.distanceFromRoadM + PROJECTION_TIE_TOLERANCE_M)
            continue;
          nearest = roadLocationSchema.parse({
            geometryRevision,
            segmentId: segment.id,
            snappedPosition: projected.geometry.coordinates,
            distanceFromRoadM,
            distanceFromOriginKm: Math.min(
              segment.properties.distanceFromOriginEndKm,
              segment.properties.distanceFromOriginStartKm + projected.properties.totalDistance,
            ),
          });
        }
        return nearest
          ? { ok: true, value: nearest }
          : {
              ok: false,
              error: {
                code: "outside_corridor",
                message: "The position is more than 500 m from the captured PE-22 corridor",
              },
            };
      },
    },
  };
}
