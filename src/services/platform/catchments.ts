import { randomUUID } from "node:crypto";
import { loadBundledCatchments } from "@peruroad/road-data/catchments";
import { readCatchmentSnapshot } from "@/db/catchments";
import { logger } from "@/lib/logger";
import { platformRoute } from "./http";
export const readCatchmentLayer = platformRoute("catchments.read", async () => {
  const started = performance.now();
  try {
    const data = await readCatchmentSnapshot();
    if (!data) throw new Error("Catchment snapshot unavailable");
    return Response.json({
      data,
      meta: {
        state: "database",
        servedAt: new Date().toISOString(),
        message: "Cuencas aproximadas HydroBASINS; no delimitadas al cruce vial. Confianza baja.",
      },
    });
  } catch (error) {
    logger.warn({
      requestId: randomUUID(),
      operation: "catchments.read",
      provider: "supabase",
      durationMs: performance.now() - started,
      result: "fallback",
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    const data = await loadBundledCatchments();
    return Response.json({
      data,
      meta: {
        state: "snapshot",
        servedAt: new Date().toISOString(),
        message: `Cuencas en instantánea del ${data.preparedAt}; confianza baja.`,
      },
    });
  }
});
