import {
  landmarkSourceSchema,
  gazetteerSchema,
  placeQuerySchema,
  type Gazetteer,
  type LocationResult,
} from "../../contracts/road-locations.ts";
import { createRoadLocator } from "./locate-road-position.ts";

export function normalizePlaceName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function buildGazetteer(segments: unknown, input: unknown): LocationResult<Gazetteer> {
  const source = landmarkSourceSchema.safeParse(input);
  if (!source.success)
    return {
      ok: false,
      error: { code: "invalid_source", message: "Landmark source failed validation" },
    };
  const locator = createRoadLocator(segments);
  if (!locator.ok) return locator;
  const entries: Gazetteer["entries"] = [];
  const excluded: Gazetteer["excluded"] = [];
  for (const landmark of [...source.data.landmarks].sort((a, b) =>
    a.sourceId.localeCompare(b.sourceId, "en"),
  )) {
    // Generic bridge labels cannot identify a place in a road report.
    if (["", "s n", "sn", "sin nombre", "peatonal"].includes(normalizePlaceName(landmark.name))) {
      excluded.push({ sourceId: landmark.sourceId, reason: "unnamed" });
      continue;
    }
    const location = locator.value.locate(landmark.position);
    if (!location.ok) {
      if (location.error.code !== "outside_corridor") return location;
      excluded.push({ sourceId: landmark.sourceId, reason: "outside_corridor" });
      continue;
    }
    entries.push({ ...landmark, location: location.value, officialKm: null, verified: false });
  }
  if (!entries.length)
    return {
      ok: false,
      error: {
        code: "invalid_source",
        message:
          "No usable landmarks remain on the captured corridor; review the source before replacing the gazetteer",
      },
    };
  return {
    ok: true,
    value: gazetteerSchema.parse({
      schemaVersion: 1,
      geometryRevision: locator.value.geometryRevision,
      source: source.data,
      entries,
      excluded,
      kilometerEvidence: {
        state: "unverified",
        anchors: entries
          .filter((entry) => entry.reportedRoadCode === "PE-22" && entry.reportedKm !== null)
          .map((entry) => ({
            sourceId: entry.sourceId,
            reportedKm: entry.reportedKm,
            distanceFromOriginKm: entry.location.distanceFromOriginKm,
            // These offsets are review evidence, not an interpolation or surveyed calibration.
            offsetKm: (entry.reportedKm ?? 0) - entry.location.distanceFromOriginKm,
          })),
      },
    }),
  };
}

export function resolvePlaceName(
  snapshot: unknown,
  query: unknown,
):
  | { status: "matched"; entry: Gazetteer["entries"][number]; requiresConfirmation: true }
  | { status: "ambiguous"; candidates: Gazetteer["entries"]; requiresConfirmation: true }
  | { status: "not_found" | "unavailable"; requiresConfirmation: true } {
  const parsed = gazetteerSchema.safeParse(snapshot);
  if (!parsed.success) return { status: "unavailable", requiresConfirmation: true };
  const parsedQuery = placeQuerySchema.safeParse(query);
  if (!parsedQuery.success || !normalizePlaceName(parsedQuery.data))
    return { status: "not_found", requiresConfirmation: true };
  const name = normalizePlaceName(parsedQuery.data);
  const candidates = parsed.data.entries.filter((entry) =>
    [entry.name, ...entry.aliases].some((alias) => normalizePlaceName(alias) === name),
  );
  const entry = candidates[0];
  if (!entry) return { status: "not_found", requiresConfirmation: true };
  if (candidates.length > 1) return { status: "ambiguous", candidates, requiresConfirmation: true };
  return { status: "matched", entry, requiresConfirmation: true };
}
