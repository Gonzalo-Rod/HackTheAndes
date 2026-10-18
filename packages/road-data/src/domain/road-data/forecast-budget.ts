/**
 * Limits on the set of forecast roads, so every served road keeps working on the free tiers.
 * - Open-Meteo allows ~10,000 location calls a day; the national rain layer uses ~1,500 (188 cells
 *   every 3 h), and each forecast weather cell costs 24 calls a day. 300 cells leave ~10% headroom.
 * - Vercel Functions cap a response at 4.5 MB; one road's 72 h exposure view is ~4.7 KB per segment,
 *   and its stored record (~6 KB per segment) must stay under the database's 8 MB payload guard.
 */
export const MAX_HOURLY_WEATHER_CELLS = 300;
export const MAX_SEGMENTS_PER_ROAD = 800;

export interface BudgetedRoad {
  roadCode: string;
  segmentCount: number;
  weatherGridCount: number;
}

export type Admission =
  | { ok: true }
  | { ok: false; reason: "road_too_long" | "weather_budget_exceeded"; message: string };

/** Cells shared between roads are counted per road, so the total is an upper bound. */
export function admitForecastRoad(
  candidate: BudgetedRoad,
  registered: readonly BudgetedRoad[],
): Admission {
  if (candidate.segmentCount > MAX_SEGMENTS_PER_ROAD)
    return {
      ok: false,
      reason: "road_too_long",
      message: `${candidate.roadCode} has ${candidate.segmentCount} segments; the limit is ${MAX_SEGMENTS_PER_ROAD}. Split it into sub-corridors.`,
    };
  const others = registered.filter((road) => road.roadCode !== candidate.roadCode);
  const cells = others.reduce(
    (sum, road) => sum + road.weatherGridCount,
    candidate.weatherGridCount,
  );
  if (cells > MAX_HOURLY_WEATHER_CELLS)
    return {
      ok: false,
      reason: "weather_budget_exceeded",
      message: `Adding ${candidate.roadCode} needs ${cells} hourly weather cells; the limit is ${MAX_HOURLY_WEATHER_CELLS}. Remove a lower-priority road first.`,
    };
  return { ok: true };
}
