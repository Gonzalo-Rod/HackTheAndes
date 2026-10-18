import type { WeatherCapture, WeatherVariable } from "../../contracts/catchment-weather.ts";
const HOUR_MS = 3_600_000;
export function aggregateRain(
  capture: WeatherCapture,
  catchmentId: string,
  variable: WeatherVariable,
  startExclusiveMs: number,
  endInclusiveMs: number,
):
  | { ok: true; precipitationMm: number; hours: number }
  | { ok: false; error: "missing_hours" | "unknown_catchment" | "invalid_window" } {
  if (
    !Number.isFinite(startExclusiveMs) ||
    !Number.isFinite(endInclusiveMs) ||
    startExclusiveMs % HOUR_MS ||
    endInclusiveMs % HOUR_MS ||
    endInclusiveMs <= startExclusiveMs ||
    endInclusiveMs - startExclusiveMs > 366 * 24 * HOUR_MS
  )
    return { ok: false, error: "invalid_window" };
  const catchment = capture.catchments.find((c) => c.catchmentId === catchmentId);
  if (!catchment) return { ok: false, error: "unknown_catchment" };
  let precipitationMm = 0;
  const hours = (endInclusiveMs - startExclusiveMs) / HOUR_MS;
  for (const { gridId, weight } of catchment.gridWeights) {
    const grid = capture.grids.find((grid) => grid.id === gridId);
    const values = grid?.values[variable];
    if (!grid || !values) return { ok: false, error: "missing_hours" };
    const firstTime = Date.parse(grid.timesUtc[0] ?? "");
    for (let hour = 1; hour <= hours; hour++) {
      const index = (startExclusiveMs + hour * HOUR_MS - firstTime) / HOUR_MS;
      const value = values[index];
      if (value === null || value === undefined) return { ok: false, error: "missing_hours" };
      precipitationMm += value * weight;
    }
  }
  return { ok: true, precipitationMm: Math.round(precipitationMm * 1000) / 1000, hours };
}
export function summarizeOperationalWeather(capture: WeatherCapture, nowMs: number) {
  const anchor = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  return capture.catchments.map((catchment) => ({
    catchmentId: catchment.catchmentId,
    rainMm72hPast: aggregateRain(
      capture,
      catchment.catchmentId,
      "precipitation",
      anchor - 72 * HOUR_MS,
      anchor,
    ),
    rainMm168hPast: aggregateRain(
      capture,
      catchment.catchmentId,
      "precipitation",
      anchor - 168 * HOUR_MS,
      anchor,
    ),
    rainMm24hForecast: aggregateRain(
      capture,
      catchment.catchmentId,
      "precipitation",
      anchor,
      anchor + 24 * HOUR_MS,
    ),
    rainMm72hForecast: aggregateRain(
      capture,
      catchment.catchmentId,
      "precipitation",
      anchor,
      anchor + 72 * HOUR_MS,
    ),
    sixHourForecasts: Array.from({ length: 12 }, (_, index) => ({
      validFrom: new Date(anchor + index * 6 * HOUR_MS).toISOString(),
      validUntil: new Date(anchor + (index + 1) * 6 * HOUR_MS).toISOString(),
      rain: aggregateRain(
        capture,
        catchment.catchmentId,
        "precipitation",
        anchor + index * 6 * HOUR_MS,
        anchor + (index + 1) * 6 * HOUR_MS,
      ),
    })),
  }));
}
