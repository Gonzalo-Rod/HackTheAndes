import { length } from "@turf/length";
import { lineSliceAlong } from "@turf/line-slice-along";
import {
  roadNetworkSnapshotSchema,
  displaySegmentsSchema,
  type Position,
  type RoadSection,
  type CorridorBuildResult,
} from "../../contracts/road-geometry.ts";

// Display resolution from the Team Plan; this is not weather or hazard resolution.
const DISPLAY_SEGMENT_KM = 1;
// Bound work and ignore only sub-millimeter floating-point residue at route end.
const MAX_DISPLAY_SEGMENTS = 10_000;
const DISTANCE_EPSILON_KM = 1e-9;
// Allow floating-point comparison noise only; do not bridge a source chainage gap.
const CHAINAGE_EPSILON_KM = 1e-6;

function samePosition(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Hashing is supplied by the service; this core has no I/O, clock, or random state. */
export function buildPe22Corridor(
  input: unknown,
  geometryRevision: (coordinates: readonly Position[]) => string,
): CorridorBuildResult {
  const parsed = roadNetworkSnapshotSchema.safeParse(input);
  const failure = (
    code: Extract<CorridorBuildResult, { ok: false }>["error"]["code"],
    message: string,
  ): CorridorBuildResult => ({ ok: false, error: { code, message } });
  if (!parsed.success) return failure("invalid_snapshot", "The road snapshot failed validation");
  const sections = [...parsed.data.features].sort(
    (a, b) =>
      a.properties.sourceKmStart - b.properties.sourceKmStart ||
      a.properties.sourceId.localeCompare(b.properties.sourceId),
  );
  const seen = new Set<string>();
  const coordinates: Position[] = [];
  const references: { startKm: number; endKm: number; section: RoadSection }[] = [];
  const diagnostics = [];
  let measuredLengthKm = 0;
  let previousSourceEnd: number | null = null;
  for (const section of sections) {
    const info = section.properties;
    if (seen.has(info.sourceId))
      return failure("duplicate_section", "Duplicate source section identity");
    seen.add(info.sourceId);
    if (
      previousSourceEnd !== null &&
      Math.abs(info.sourceKmStart - previousSourceEnd) > CHAINAGE_EPSILON_KM
    ) {
      return failure("invalid_chainage", "Source kilometer ranges contain a gap or overlap");
    }
    previousSourceEnd = info.sourceKmEnd;
    const parts =
      section.geometry.type === "LineString"
        ? [section.geometry.coordinates]
        : section.geometry.coordinates;
    const sectionCoordinates: Position[] = [];
    for (const part of parts) {
      for (const [index, position] of part.entries()) {
        const last = sectionCoordinates.at(-1) ?? coordinates.at(-1);
        if (index === 0 && last && !samePosition(last, position)) {
          return failure(
            "disconnected_geometry",
            "Road sections are disconnected or reversed; no gap was bridged",
          );
        }
        if (!last || !samePosition(last, position)) sectionCoordinates.push(position);
      }
    }
    const start = coordinates.at(-1);
    const local = start ? [start, ...sectionCoordinates] : sectionCoordinates;
    const geometry = { type: "LineString" as const, coordinates: local };
    const sectionLengthKm = length(
      { type: "Feature", properties: {}, geometry },
      { units: "kilometers" },
    );
    if (local.length < 2 || sectionLengthKm <= DISTANCE_EPSILON_KM) {
      return failure("zero_length_geometry", "A source section has no measurable geometry");
    }
    references.push({
      startKm: measuredLengthKm,
      endKm: measuredLengthKm + sectionLengthKm,
      section,
    });
    measuredLengthKm += sectionLengthKm;
    coordinates.push(...sectionCoordinates);
    diagnostics.push({
      sourceId: info.sourceId,
      sourceLengthKm: info.sourceLengthKm,
      measuredLengthKm: sectionLengthKm,
      lengthDifferenceKm: sectionLengthKm - info.sourceLengthKm,
    });
  }
  const count = Math.ceil((measuredLengthKm - DISTANCE_EPSILON_KM) / DISPLAY_SEGMENT_KM);
  if (count > MAX_DISPLAY_SEGMENTS)
    return failure("too_many_segments", "The road geometry exceeds the display segment limit");
  const revision = geometryRevision(coordinates);
  const geometry = { type: "LineString" as const, coordinates };
  const segments = displaySegmentsSchema.parse({
    type: "FeatureCollection",
    features: Array.from({ length: count }, (_, index) => {
      const startKm = index * DISPLAY_SEGMENT_KM;
      const endKm = Math.min(startKm + DISPLAY_SEGMENT_KM, measuredLengthKm);
      const slice = lineSliceAlong(geometry, startKm, endKm, { units: "kilometers" });
      return {
        type: "Feature",
        id: `PE-22:${revision}:${index.toString().padStart(5, "0")}`,
        geometry: slice.geometry,
        properties: {
          roadCode: "PE-22",
          geometryRevision: revision,
          distanceFromOriginStartKm: startKm,
          distanceFromOriginEndKm: endKm,
          lengthKm: endKm - startKm,
          sourceReferences: references
            .filter(
              (ref) =>
                ref.endKm > startKm + DISTANCE_EPSILON_KM &&
                ref.startKm < endKm - DISTANCE_EPSILON_KM,
            )
            .map(({ section }) => ({
              sourceId: section.properties.sourceId,
              sourceKmStart: section.properties.sourceKmStart,
              sourceKmEnd: section.properties.sourceKmEnd,
            })),
          kilometerCalibration: "unverified",
          officialKmStart: null,
          officialKmEnd: null,
          elevationM: null,
        },
      };
    }),
  });
  return {
    ok: true,
    value: {
      corridor: {
        type: "Feature",
        properties: { roadCode: "PE-22", geometryRevision: revision, measuredLengthKm },
        geometry,
      },
      segments,
      diagnostics,
    },
  };
}
