import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createExposureView,
  readBundledExposure,
  DEFAULT_EXPOSURE_POLICY,
  exposureHash,
  PILOT_ROAD_CODE,
} from "@peruroad/road-data/exposure";
import { loadGeometryRevision } from "@/config/env";
import { readLatestExposure } from "@/db/exposure";
import type { ForecastRoad } from "@/contracts/forecast-roads";
import { logger } from "@/lib/logger";
import { loadForecastRoads, resolveForecastRoad } from "./forecast-roads";
import { failure, platformRoute } from "./http";
const querySchema = z
  .object({
    horizonHours: z.coerce
      .number()
      .pipe(z.union([z.literal(24), z.literal(72)]))
      .default(24),
    road: z.string().max(12).optional(),
  })
  .strict();
/** Without a road, the pilot's configured revision is used, so WhatsApp alerts never depend on the registry. */
export async function loadExposureView(
  horizonHours: 24 | 72,
  nowMs = Date.now(),
  road?: Pick<ForecastRoad, "roadCode" | "geometryRevision">,
) {
  const target = road ?? { roadCode: PILOT_ROAD_CODE, geometryRevision: loadGeometryRevision() };
  const started = performance.now();
  let storage: "database" | "snapshot" = "database";
  let record;
  try {
    record = await readLatestExposure(target.geometryRevision);
    if (!record) throw new Error("Exposure snapshot unavailable");
  } catch (error) {
    storage = "snapshot";
    logger.warn({
      requestId: randomUUID(),
      operation: "exposure.read",
      provider: "supabase",
      durationMs: performance.now() - started,
      result: "fallback",
      roadCode: target.roadCode,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    record = await readBundledExposure(target.roadCode).catch(() =>
      failure(503, "exposure_unavailable", `Evaluación de ${target.roadCode} no disponible; no implica ausencia de peligro.`),
    );
  }
  if (
    record.assessment.geometryRevision !== target.geometryRevision ||
    record.assessment.policySha256 !== exposureHash(DEFAULT_EXPOSURE_POLICY)
  )
    failure(503, "exposure_unavailable", "Evaluación no disponible para la geometría y reglas actuales.");
  const view = createExposureView(record.assessment, nowMs, storage, horizonHours, true);
  if (storage === "snapshot") view.meta.message = `Instantánea del ${view.data.sources.weatherCapturedAt}. ${view.meta.message}`;
  return view;
}
export const readExposure = platformRoute("exposure.read", async (request) => {
  const search = new URL(request.url).searchParams;
  const query = querySchema.safeParse(Object.fromEntries(search));
  if (!query.success || search.getAll("horizonHours").length > 1 || search.getAll("road").length > 1)
    failure(400, "invalid_input", "El horizonte debe ser 24 o 72 horas y la carretera un código como PE-22.");
  const road = await resolveForecastRoad(query.data.road ?? null);
  return Response.json(await loadExposureView(query.data.horizonHours, Date.now(), road));
});
/** GET /api/exposure/roads: roads with reviewed exposure inputs; others have no estimate yet. */
export const readForecastRoads = platformRoute("exposure.roads", async () => Response.json({ roads: await loadForecastRoads() }));
