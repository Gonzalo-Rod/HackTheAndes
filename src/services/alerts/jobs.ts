import { authorizeJob } from "@/services/jobs/authorize";
import { randomUUID } from "node:crypto";
import { createExposureRepository, refreshExposureWeather } from "@peruroad/road-data/exposure";
import { createPrecipitationProvider, createDataSnapshotRepository, weatherCaptureSchema } from "@peruroad/road-data/weather";
import { database } from "@/db/pool";
import { getJson } from "@/integrations/http/fetch-json";
import { platformRoute, failure } from "@/services/platform/http";
import { PILOT_ROAD_CODE } from "@peruroad/road-data/exposure";
import type { ForecastRoad } from "@/contracts/forecast-roads";
import { logger } from "@/lib/logger";
import { loadForecastRoads } from "@/services/platform/forecast-roads";
import { evaluateRouteWatchSafely } from "@/services/route-watch/source-change";
import { runAlertEvaluation } from "./runtime";
/** Source changes and the 5-minute recovery both land here, so monitor calls share the same triggers. */
export const evaluateAlerts = platformRoute("alerts.job", async (request) => {
  authorizeJob(request);
  const alerts = await runAlertEvaluation();
  const routeWatch = await evaluateRouteWatchSafely(alerts.requestId);
  return Response.json({ ...alerts, routeWatch: routeWatch.ok ? routeWatch.value : { error: routeWatch.error } });
});
/** Weather is refreshed hourly; a newer capture is reused so overlapping calls stay cheap. */
const CLIMATE_FRESH_MS = 55 * 60_000;
/**
 * Only the latest assessment is read; a day is kept for audit. Each record is ~1 MB of JSON per
 * 200 km road, so unbounded hourly history would fill the database within days once roads are added.
 */
const EXPOSURE_RETENTION_MS = 24 * 60 * 60_000;
type ClimateOutcome =
  | { roadCode: string; state: "fresh" | "stored" | "preserved"; assessmentId: string; capturedAt: string; pruned?: number }
  | { roadCode: string; state: "unavailable" | "failed"; errorType?: string };

async function refreshRoad(road: ForecastRoad, requestId: string): Promise<ClimateOutcome> {
  const repository = createExposureRepository(database());
  const previous = await repository.readLatest(road.geometryRevision);
  if (!previous) return { roadCode: road.roadCode, state: "unavailable" };
  const capturedAt = previous.assessment.sources.weatherCapturedAt;
  // Concurrent hourly calls can fetch once each, but immutable content keys keep writes idempotent.
  if (Date.now() - Date.parse(capturedAt) < CLIMATE_FRESH_MS)
    return { roadCode: road.roadCode, state: "fresh", assessmentId: previous.assessment.assessmentId, capturedAt };
  const provider = createPrecipitationProvider({
    getJson: (url, options) => getJson(url, { ...options, provider: "open-meteo", operation: "climate.weather.refresh" }),
  });
  const record = await refreshExposureWeather(previous, provider, requestId, () => new Date());
  await createDataSnapshotRepository(database(), weatherCaptureSchema).save({
    dataset: "weather-operational",
    key: "scheduled-latest.json.gz",
    geometryRevision: record.input.geometryRevision,
    capturedAt: record.input.weather.capturedAt,
    payload: record.input.weather,
  });
  const saved = await repository.save(record);
  const pruned = await repository.prune(road.geometryRevision, new Date(Date.now() - EXPOSURE_RETENTION_MS).toISOString());
  return {
    roadCode: road.roadCode,
    pruned,
    state: saved.state,
    assessmentId: saved.record.assessment.assessmentId,
    capturedAt: saved.record.assessment.sources.weatherCapturedAt,
  };
}

/** POST /api/jobs/climate: hourly weather refresh for every forecast road; one road failing never blocks the others. */
export const refreshClimate = platformRoute("climate.refresh", async (request) => {
  authorizeJob(request);
  const requestId = randomUUID();
  const roads: ClimateOutcome[] = [];
  // Sequential calls keep Open-Meteo bursts small; each road needs only a few batched requests.
  for (const road of await loadForecastRoads()) {
    try {
      roads.push(await refreshRoad(road, requestId));
    } catch (error) {
      const errorType = error instanceof Error ? error.name : "UnknownError";
      logger.error({
        requestId,
        operation: "climate.refresh",
        provider: "open-meteo",
        result: "error",
        roadCode: road.roadCode,
        errorType,
      });
      roads.push({ roadCode: road.roadCode, state: "failed", errorType });
    }
  }
  const pilot = roads.find((road) => road.roadCode === PILOT_ROAD_CODE);
  if (!roads.some((road) => "assessmentId" in road)) failure(503, "exposure_unavailable", "No hay una base espacial disponible.");
  // Pilot fields stay at the top level for existing n8n checks.
  return Response.json({ ...(pilot && "assessmentId" in pilot ? pilot : { state: "partial" }), requestId, roads });
});
