import type { CorridorData } from "@/contracts/corridor";
import type { CorridorRainResponse } from "@/contracts/weather";
import { pointAtKm } from "@/domain/geo/measure";
import { elevationAtKm } from "@/domain/road-alerts/corridor-placement";
import { sampleKms, splitRainWindow } from "@/domain/weather/rain";
import type { RainProvider } from "@/integrations/open-meteo/open-meteo-client";
import { logger } from "@/lib/logger";
import { err, ok, type Result } from "@/lib/result";

export const RAIN_SAMPLE_COUNT = 9;
/** Open-Meteo refreshes its models hourly; half an hour keeps the load negligible. */
export const RAIN_CACHE_TTL_MS = 30 * 60_000;

export interface RainServiceError {
  code: "upstream_unavailable";
  message: string;
}

interface Deps {
  provider: RainProvider;
  loadCorridor: () => Promise<CorridorData>;
  now?: () => number;
  ttlMs?: number;
}

export function createCorridorRainService({ provider, loadCorridor, now = Date.now, ttlMs = RAIN_CACHE_TTL_MS }: Deps) {
  let cached: { value: CorridorRainResponse; at: number } | null = null;

  return {
    async getRain(requestId?: string): Promise<Result<CorridorRainResponse, RainServiceError>> {
      const current = now();
      if (cached && current - cached.at < ttlMs) return ok(cached.value);
      try {
        const corridor = await loadCorridor();
        const points = sampleKms(corridor.kmTotal, RAIN_SAMPLE_COUNT).map((km) => {
          const [lng, lat] = pointAtKm(corridor.line, km);
          return { km, lng, lat };
        });
        const hourly = await provider.fetchHourlyRain(points, requestId);
        const nowSec = Math.floor(current / 1000);
        if (hourly.length !== points.length) throw new Error("Invalid rain point count");
        const samples: CorridorRainResponse["samples"] = [];
        for (const [index, point] of points.entries()) {
          const series = hourly[index];
          const window = splitRainWindow(series.timesSec, series.precipitation, nowSec);
          if (!window.ok) {
            logger.warn({
              operation: "weather.corridorRain",
              provider: "open-meteo",
              requestId,
              result: "error",
              errorType: window.error.code,
            });
            if (cached) return ok({ ...cached.value, stale: true });
            return err({ code: "upstream_unavailable", message: "Faltan datos horarios de lluvia; no se puede calcular el acumulado." });
          }
          samples.push({ ...point, elevationM: elevationAtKm(corridor.profile, point.km), ...window.value });
        }
        const value: CorridorRainResponse = {
          samples,
          fetchedAt: new Date(current).toISOString(),
          source: "open-meteo",
          stale: false,
        };
        cached = { value, at: current };
        return ok(value);
      } catch (error) {
        logger.warn({
          operation: "weather.corridorRain",
          requestId,
          result: "error",
          provider: "open-meteo",
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
        // Serve the last good data, flagged, rather than hiding the layer on a provider blip.
        if (cached) return ok({ ...cached.value, stale: true });
        return err({ code: "upstream_unavailable", message: "El pronóstico de lluvia no está disponible." });
      }
    },
  };
}
