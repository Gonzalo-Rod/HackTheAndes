import type { NationalRainResponse } from "@/contracts/weather";
import type { LngLat } from "@/domain/geo/measure";
import { interpolateRain } from "@/domain/weather/national-grid";
import { splitRainWindow } from "@/domain/weather/rain";
import type { RainProvider } from "@/integrations/open-meteo/open-meteo-client";
import { logger } from "@/lib/logger";
import { err, ok, type Result } from "@/lib/result";

// Display context only; three hours keeps its 188 cells at ~1,500 Open-Meteo calls a day, leaving the
// free tier's ~10,000 for the hourly road forecasts (see packages/road-data forecast-budget.ts).
export const NATIONAL_RAIN_CACHE_TTL_MS = 3 * 60 * 60_000;
/** Locations per request; keeps URLs short and lets one failing batch be retried alone. */
const BATCH_SIZE = 100;

interface Deps {
  provider: RainProvider;
  grid: { stepDeg: number; centers: readonly LngLat[]; displayStepDeg: number; displayCenters: readonly LngLat[] };
  now?: () => number;
}

export function createNationalRainService({ provider, grid, now = Date.now }: Deps) {
  let cached: { value: NationalRainResponse; at: number } | null = null;
  return {
    async getRain(requestId?: string): Promise<Result<NationalRainResponse, { code: "upstream_unavailable"; message: string }>> {
      const current = now();
      if (cached && current - cached.at < NATIONAL_RAIN_CACHE_TTL_MS) return ok(cached.value);
      try {
        const nowSec = Math.floor(current / 1000);
        const cells: NationalRainResponse["cells"] = [];
        let missingCells = 0;
        for (let start = 0; start < grid.centers.length; start += BATCH_SIZE) {
          const batch = grid.centers.slice(start, start + BATCH_SIZE);
          const hourly = await provider.fetchHourlyRain(
            batch.map(([lng, lat]) => ({ lng, lat })),
            requestId,
          );
          batch.forEach(([lng, lat], index) => {
            const series = hourly[index];
            const window = series ? splitRainWindow(series.timesSec, series.precipitation, nowSec) : null;
            if (!window?.ok) missingCells++;
            else cells.push({ lng, lat, pastMm: window.value.pastMm, nextMm: window.value.nextMm });
          });
        }
        const value: NationalRainResponse = {
          cells,
          stepDeg: grid.stepDeg,
          display: { stepDeg: grid.displayStepDeg, cells: interpolateRain(cells, grid.stepDeg, grid.displayCenters) },
          missingCells,
          fetchedAt: new Date(current).toISOString(),
          source: "open-meteo",
          stale: false,
        };
        cached = { value, at: current };
        return ok(value);
      } catch (error) {
        logger.warn({
          operation: "weather.nationalRain",
          requestId,
          result: "error",
          provider: "open-meteo",
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
        if (cached) return ok({ ...cached.value, stale: true });
        return err({ code: "upstream_unavailable", message: "El pronóstico nacional de lluvia no está disponible." });
      }
    },
  };
}
