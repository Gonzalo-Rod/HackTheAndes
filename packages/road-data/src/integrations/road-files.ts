import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { PILOT_ROAD_CODE, roadCodeSchema, type RoadCode } from "../contracts/road-geometry.ts";

const DATA = new URL("../../data/", import.meta.url);
const ROADS = new URL("roads/", DATA);
const CACHE = new URL(".cache/roads/", DATA);

/** Directory-safe name: lower case, with Ñ spelled out because PE-1NN and PE-1NÑ both exist. */
export function roadSlug(code: string): string {
  return roadCodeSchema.parse(code).toLowerCase().replace("ñ", "-enye");
}

export interface RoadFiles {
  roadCode: RoadCode;
  directory: URL;
  cache: URL;
  source: URL;
  corridor: URL;
  segments: URL;
  diagnostics: URL;
  manifest: URL;
  catchments: URL;
  hazards: URL;
  /** Raw INGEMMET/SENAMHI capture; only the pilot keeps it under version control. */
  hazardSource: URL;
  weatherLive: URL;
  exposure: URL;
  catchmentCandidate: URL;
  hazardCandidate: URL;
}

/** The pilot keeps its original reviewed paths; every other road lives in data/roads/<slug>/. */
export function roadFiles(code: string): RoadFiles {
  const roadCode = roadCodeSchema.parse(code);
  const slug = roadSlug(roadCode);
  const cache = new URL(`${slug}/`, CACHE);
  if (roadCode === PILOT_ROAD_CODE) {
    const directory = new URL("pe22/", DATA);
    return {
      roadCode,
      directory,
      cache,
      source: new URL("source.json", directory),
      corridor: new URL("corridor.geojson", directory),
      segments: new URL("segments-1km.geojson", directory),
      diagnostics: new URL("diagnostics.json", directory),
      manifest: new URL("manifest.json", directory),
      catchments: new URL("catchments.json", directory),
      hazards: new URL("hazards.json", directory),
      hazardSource: new URL("spatial/hazards-source.json.gz", DATA),
      weatherLive: new URL("weather/live.json.gz", DATA),
      exposure: new URL("exposure/latest.json.gz", DATA),
      catchmentCandidate: new URL(".cache/catchments-candidate.json", DATA),
      hazardCandidate: new URL(".cache/hazards-candidate.json", DATA),
    };
  }
  const directory = new URL(`${slug}/`, ROADS);
  return {
    roadCode,
    directory,
    cache,
    source: new URL("source.json", directory),
    corridor: new URL("corridor.geojson", directory),
    segments: new URL("segments-1km.geojson", directory),
    diagnostics: new URL("diagnostics.json", directory),
    manifest: new URL("manifest.json", directory),
    catchments: new URL("catchments.json", directory),
    hazards: new URL("hazards.json.gz", directory),
    hazardSource: new URL("hazards-source.json.gz", cache),
    weatherLive: new URL("weather-live.json.gz", directory),
    exposure: new URL("exposure.json.gz", directory),
    catchmentCandidate: new URL("catchments-candidate.json", cache),
    hazardCandidate: new URL("hazards-candidate.json", cache),
  };
}

// Bounds decompression of a corrupted or hostile archive; the largest road capture is ~40 MB.
const MAX_JSON_BYTES = 128 * 1024 * 1024;

/** Reads a road data file, gunzipping `.gz` paths. */
export async function readRoadJson(url: URL): Promise<unknown> {
  const data = await readFile(url);
  const text = url.pathname.endsWith(".gz")
    ? gunzipSync(data, { maxOutputLength: MAX_JSON_BYTES }).toString("utf8")
    : data.toString("utf8");
  return JSON.parse(text);
}

const registrySchema = z
  .object({
    schemaVersion: z.literal(1),
    roads: z.array(
      z
        .object({
          roadCode: roadCodeSchema,
          name: z.string(),
          geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
          measuredLengthKm: z.number().positive(),
          segmentCount: z.number().int().positive(),
          catchmentCount: z.number().int().positive(),
          weatherGridCount: z.number().int().positive(),
          preparedAt: z.iso.datetime({ offset: true }),
        })
        .strict(),
    ),
  })
  .strict()
  .refine(
    (value) => new Set(value.roads.map((road) => road.roadCode)).size === value.roads.length,
    "Duplicate road in the forecast registry",
  );
export type RoadRegistry = z.infer<typeof registrySchema>;
export type RoadRegistryEntry = RoadRegistry["roads"][number];
export const ROAD_REGISTRY_URL = new URL("registry.json", ROADS);

/** Roads whose forecast inputs were prepared and validated, including the pilot. */
export async function readRoadRegistry(url: URL = ROAD_REGISTRY_URL): Promise<RoadRegistry> {
  try {
    return registrySchema.parse(JSON.parse(await readFile(url, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return { schemaVersion: 1, roads: [] };
    throw error;
  }
}

export function parseRoadRegistry(input: unknown): RoadRegistry {
  return registrySchema.parse(input);
}
