import type { ForecastEvent, ForecastProjection, ForecastWindow } from "./forecast-events";
import type { ForecastMapData } from "./forecast-map";

export interface RoadForecast {
  roadCode: string;
  projection: ForecastProjection;
}
export interface RoadCoverage {
  roadCode: string;
  state: ForecastProjection["state"];
  message: string;
}
export interface NationalForecastProjection extends ForecastProjection {
  coverage: RoadCoverage[];
}

const CATEGORY_RANK: Record<ForecastEvent["category"], number> = { high_attention: 0, priority: 1 };

function byAttention(a: ForecastEvent, b: ForecastEvent): number {
  return CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || a.roadCode.localeCompare(b.roadCode) || a.startKm - b.startKm;
}

/**
 * One list of 6-hour windows for every forecast road. Windows share an id when they start at the
 * same instant, which holds while one hourly job refreshes all roads. Unavailable roads are reported
 * in `coverage` and never counted as low risk.
 */
export function mergeForecastProjections(forecasts: readonly RoadForecast[]): NationalForecastProjection {
  const coverage = forecasts.map(({ roadCode, projection }) => ({ roadCode, state: projection.state, message: projection.message }));
  const ready = forecasts.filter(({ projection }) => projection.state === "ready");
  if (!ready.length)
    return {
      state: "unavailable",
      message: forecasts[0]?.projection.message ?? "Pronóstico no disponible. No implica ausencia de peligro.",
      geometryRevision: null,
      capturedAt: null,
      windows: [],
      coverage,
    };
  const windows = new Map<string, ForecastWindow>();
  for (const { projection } of ready)
    for (const window of projection.windows) {
      const merged = windows.get(window.id);
      if (!merged) {
        windows.set(window.id, { ...window, events: [...window.events] });
        continue;
      }
      merged.events.push(...window.events);
      merged.assessedSegments += window.assessedSegments;
      merged.unknownSegments += window.unknownSegments;
    }
  for (const window of windows.values()) window.events.sort(byAttention);
  // The oldest capture bounds how fresh the combined view can claim to be.
  const capturedAt =
    ready
      .map(({ projection }) => projection.capturedAt)
      .filter((value) => value !== null)
      .sort()[0] ?? null;
  return {
    state: "ready",
    message: ready[0]?.projection.message ?? "",
    geometryRevision: ready.length === 1 ? (ready[0]?.projection.geometryRevision ?? null) : null,
    capturedAt,
    windows: [...windows.values()].sort((a, b) => Date.parse(a.validFrom) - Date.parse(b.validFrom)),
    coverage,
  };
}

export interface MergedForecastMap {
  data: ForecastMapData;
  bounds: Record<string, [number, number, number, number]>;
  message: string | null;
}

export function mergeForecastMaps(maps: readonly MergedForecastMap[]): MergedForecastMap {
  const messages = [...new Set(maps.map((map) => map.message).filter((message) => message !== null))];
  return {
    data: { type: "FeatureCollection", features: maps.flatMap((map) => map.data.features) },
    bounds: Object.assign({}, ...maps.map((map) => map.bounds)) as MergedForecastMap["bounds"],
    message: messages.length ? messages.join(" ") : null,
  };
}
