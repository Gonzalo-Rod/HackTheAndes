import { readBundledCorridor } from "@/integrations/local-data/corridor";
import { buildDatabaseCorridor } from "@/domain/geo/database-corridor";
import { dashboardRepository } from "./runtime";
import { logger } from "@/lib/logger";
import type { CorridorData } from "@/contracts/corridor";

// A short per-instance cache avoids repeating spatial reads for browser and weather requests.
const CORRIDOR_CACHE_MS = 60_000;
let cached: { value: CorridorData; expiresAtMs: number } | undefined;
let inFlight: Promise<CorridorData> | undefined;
export async function loadDashboardCorridor(): Promise<CorridorData> {
  if (cached && Date.now() < cached.expiresAtMs) return cached.value;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const started = performance.now();
    const bundled = await readBundledCorridor();
    try {
      const value = buildDatabaseCorridor(await dashboardRepository().segments(), bundled);
      cached = { value, expiresAtMs: Date.now() + CORRIDOR_CACHE_MS };
      return value;
    } catch (error) {
      logger.warn({
        requestId: crypto.randomUUID(),
        operation: "corridor.load",
        provider: "supabase",
        durationMs: performance.now() - started,
        result: "fallback",
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      return {
        ...bundled,
        metadata: {
          ...bundled.metadata,
          state: "snapshot",
          message: `Corredor en instantánea del ${bundled.metadata.retrievedAt}; base de datos no disponible. Kilometraje sin calibrar.`,
        },
      };
    }
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = undefined;
  }
}
