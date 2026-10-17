import { isDeepStrictEqual } from "node:util";
import {
  gazetteerSchema,
  type Gazetteer,
  type LandmarkProvider,
  type LocationResult,
  type RoadLocation,
} from "../contracts/road-locations.ts";
import { buildGazetteer } from "../domain/road-data/build-gazetteer.ts";
import { createRoadLocator } from "../domain/road-data/locate-road-position.ts";

// Trigonometric results can differ across CPU/Node builds; permit about 1 mm, not source edits.
const DISTANCE_TOLERANCE_M = 0.001;
const DISTANCE_TOLERANCE_KM = DISTANCE_TOLERANCE_M / 1000;
const COORDINATE_TOLERANCE_DEGREES = 1e-8;

function sameProjection(actual: RoadLocation, expected: RoadLocation): boolean {
  return (
    actual.geometryRevision === expected.geometryRevision &&
    actual.segmentId === expected.segmentId &&
    Math.abs(actual.distanceFromOriginKm - expected.distanceFromOriginKm) <=
      DISTANCE_TOLERANCE_KM &&
    Math.abs(actual.distanceFromRoadM - expected.distanceFromRoadM) <= DISTANCE_TOLERANCE_M &&
    actual.snappedPosition.every(
      (value, index) =>
        Math.abs(value - (expected.snappedPosition[index] ?? Infinity)) <=
        COORDINATE_TOLERANCE_DEGREES,
    )
  );
}

export async function preparePe22Gazetteer({
  segments,
  provider,
  ...options
}: {
  segments: unknown;
  provider: LandmarkProvider;
  requestId?: string;
  signal?: AbortSignal;
}) {
  const geometry = createRoadLocator(segments);
  if (!geometry.ok) return geometry;
  return buildGazetteer(segments, await provider.fetchLandmarks(options));
}
export function validateGazetteerSnapshot(
  segments: unknown,
  input: unknown,
): LocationResult<Gazetteer> {
  const parsed = gazetteerSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "invalid_snapshot", message: "Gazetteer snapshot failed validation" },
    };
  const rebuilt = buildGazetteer(segments, parsed.data.source);
  if (!rebuilt.ok) return rebuilt;
  const comparable: Gazetteer = {
    ...parsed.data,
    entries: parsed.data.entries.map((entry, index) => {
      const expected = rebuilt.value.entries[index];
      return expected && sameProjection(entry.location, expected.location)
        ? { ...entry, location: expected.location }
        : entry;
    }),
    kilometerEvidence: {
      ...parsed.data.kilometerEvidence,
      anchors: parsed.data.kilometerEvidence.anchors.map((anchor, index) => {
        const expected = rebuilt.value.kilometerEvidence.anchors[index];
        return expected &&
          Math.abs(anchor.distanceFromOriginKm - expected.distanceFromOriginKm) <=
            DISTANCE_TOLERANCE_KM &&
          Math.abs(anchor.offsetKm - expected.offsetKm) <= DISTANCE_TOLERANCE_KM
          ? {
              ...anchor,
              distanceFromOriginKm: expected.distanceFromOriginKm,
              offsetKm: expected.offsetKm,
            }
          : anchor;
      }),
    },
  };
  if (!isDeepStrictEqual(rebuilt.value, comparable))
    return {
      ok: false,
      error: {
        code: "invalid_snapshot",
        message: "Gazetteer does not reproduce against current geometry and sources",
      },
    };
  // Preserve the accepted artifact's bytes/values so imports on different machines remain idempotent.
  return { ok: true, value: parsed.data };
}
