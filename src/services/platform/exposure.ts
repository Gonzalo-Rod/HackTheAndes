import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createExposureView, readBundledExposure, DEFAULT_EXPOSURE_POLICY, exposureHash } from "@peruroad/road-data/exposure";
import { readLatestExposure } from "@/db/exposure";
import { loadGeometryRevision } from "@/config/env";
import { logger } from "@/lib/logger";
import { failure, platformRoute } from "./http";
const querySchema = z
  .object({
    horizonHours: z.coerce
      .number()
      .pipe(z.union([z.literal(24), z.literal(72)]))
      .default(24),
  })
  .strict();
export const readExposure = platformRoute("exposure.read", async (request) => {
  const search = new URL(request.url).searchParams;
  const query = querySchema.safeParse(Object.fromEntries(search));
  if (!query.success || search.getAll("horizonHours").length > 1)
    failure(400, "invalid_input", "El horizonte debe ser 24 o 72 horas, sin parámetros adicionales.");
  const started = performance.now();
  let storage: "database" | "snapshot" = "database";
  let record;
  try {
    record = await readLatestExposure();
    if (!record) throw new Error("Exposure snapshot unavailable");
  } catch (error) {
    storage = "snapshot";
    logger.warn({
      requestId: randomUUID(),
      operation: "exposure.read",
      provider: "supabase",
      durationMs: performance.now() - started,
      result: "fallback",
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    record = await readBundledExposure();
  }
  if (
    record.assessment.geometryRevision !== loadGeometryRevision() ||
    record.assessment.policySha256 !== exposureHash(DEFAULT_EXPOSURE_POLICY)
  )
    failure(503, "exposure_unavailable", "Evaluación no disponible para la geometría y reglas actuales.");
  const view = createExposureView(record.assessment, Date.now(), storage, query.data.horizonHours);
  if (storage === "snapshot") view.meta.message = `Instantánea del ${view.data.sources.weatherCapturedAt}. ${view.meta.message}`;
  return Response.json(view);
});
