import { authorizeJob } from "@/services/jobs/authorize";
import { randomUUID } from "node:crypto";
import { createExposureRepository, refreshExposureWeather } from "@peruroad/road-data/exposure";
import { createPrecipitationProvider, createDataSnapshotRepository, weatherCaptureSchema } from "@peruroad/road-data/weather";
import { database } from "@/db/pool";
import { getJson } from "@/integrations/http/fetch-json";
import { platformRoute, failure } from "@/services/platform/http";
import { loadGeometryRevision } from "@/config/env";
import { runAlertEvaluation } from "./runtime";
export const evaluateAlerts = platformRoute("alerts.job", async (request) => {
  authorizeJob(request);
  return Response.json(await runAlertEvaluation());
});
export const refreshClimate = platformRoute("climate.refresh", async (request) => {
  authorizeJob(request);
  const repository = createExposureRepository(database());
  const previous = await repository.readLatest(loadGeometryRevision());
  if (!previous) failure(503, "exposure_unavailable", "No hay una base espacial disponible.");
  // Concurrent hourly calls can fetch once each, but immutable content keys keep writes idempotent.
  if (Date.now() - Date.parse(previous.assessment.sources.weatherCapturedAt) < 55 * 60_000)
    return Response.json({ state: "fresh", assessmentId: previous.assessment.assessmentId });
  const provider = createPrecipitationProvider({
    getJson: (url, options) => getJson(url, { ...options, provider: "open-meteo", operation: "climate.weather.refresh" }),
  });
  const record = await refreshExposureWeather(previous, provider, randomUUID(), () => new Date());
  await createDataSnapshotRepository(database(), weatherCaptureSchema).save({
    dataset: "weather-operational",
    key: "scheduled-latest.json.gz",
    geometryRevision: record.input.geometryRevision,
    capturedAt: record.input.weather.capturedAt,
    payload: record.input.weather,
  });
  const saved = await repository.save(record);
  return Response.json({
    state: saved.state,
    assessmentId: saved.record.assessment.assessmentId,
    capturedAt: saved.record.assessment.sources.weatherCapturedAt,
  });
});
