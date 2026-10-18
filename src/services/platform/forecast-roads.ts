import { PILOT_ROAD_CODE, readRoadRegistry, roadCodeSchema, type RoadRegistryEntry } from "@peruroad/road-data/exposure";
import { loadGeometryRevision } from "@/config/env";
import type { ForecastRoad } from "@/contracts/forecast-roads";
import { failure } from "./http";

/** Registry content is part of the deployment; reading it once per instance is enough. */
let cached: Promise<RoadRegistryEntry[]> | null = null;

/**
 * Roads with reviewed climate-exposure inputs. The registry is versioned with the code, so a test
 * or partial database import never becomes a live forecast road; the pilot keeps its configured revision.
 */
export async function loadForecastRoads(): Promise<ForecastRoad[]> {
  const pending = (cached ??= readRoadRegistry().then((registry) => registry.roads));
  const roads = await pending.catch((error: unknown) => {
    cached = null;
    throw error;
  });
  const pilotRevision = loadGeometryRevision();
  return roads
    .map((road) => ({
      roadCode: road.roadCode,
      name: road.name,
      geometryRevision: road.roadCode === PILOT_ROAD_CODE ? pilotRevision : road.geometryRevision,
      measuredLengthKm: road.measuredLengthKm,
      pilot: road.roadCode === PILOT_ROAD_CODE,
    }))
    .sort((a, b) => Number(b.pilot) - Number(a.pilot) || a.roadCode.localeCompare(b.roadCode));
}

/** Resolves the `road` query parameter; absent means the pilot for older clients and n8n. */
export async function resolveForecastRoad(code: string | null): Promise<ForecastRoad> {
  const roadCode = code ?? PILOT_ROAD_CODE;
  if (!roadCodeSchema.safeParse(roadCode).success) failure(400, "invalid_input", "Código de carretera inválido.");
  const road = (await loadForecastRoads()).find((item) => item.roadCode === roadCode);
  if (!road) failure(404, "road_not_covered", `La carretera ${roadCode} aún no tiene estimación de exposición climática.`);
  return road;
}
