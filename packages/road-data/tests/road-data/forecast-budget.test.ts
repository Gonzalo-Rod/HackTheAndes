import { describe, expect, it } from "vitest";
import {
  admitForecastRoad,
  MAX_HOURLY_WEATHER_CELLS,
  MAX_SEGMENTS_PER_ROAD,
} from "../../src/domain/road-data/forecast-budget.ts";

const pilot = { roadCode: "PE-22", segmentCount: 174, weatherGridCount: 24 };

describe("admitForecastRoad", () => {
  it("admits a road that fits both limits", () => {
    expect(
      admitForecastRoad({ roadCode: "PE-32", segmentCount: 297, weatherGridCount: 30 }, [pilot]),
    ).toEqual({ ok: true });
  });

  it("rejects a road longer than one response can carry, at the boundary", () => {
    expect(
      admitForecastRoad(
        { roadCode: "PE-X", segmentCount: MAX_SEGMENTS_PER_ROAD, weatherGridCount: 1 },
        [],
      ).ok,
    ).toBe(true);
    const long = admitForecastRoad(
      { roadCode: "PE-3N", segmentCount: MAX_SEGMENTS_PER_ROAD + 1, weatherGridCount: 1 },
      [],
    );
    expect(long).toMatchObject({ ok: false, reason: "road_too_long" });
  });

  it("rejects a road that would exceed the hourly weather budget, at the boundary", () => {
    const fits = {
      roadCode: "PE-18",
      segmentCount: 285,
      weatherGridCount: MAX_HOURLY_WEATHER_CELLS - pilot.weatherGridCount,
    };
    expect(admitForecastRoad(fits, [pilot]).ok).toBe(true);
    const over = { ...fits, weatherGridCount: fits.weatherGridCount + 1 };
    expect(admitForecastRoad(over, [pilot])).toMatchObject({
      ok: false,
      reason: "weather_budget_exceeded",
    });
  });

  it("re-registering a road replaces its own cells instead of counting them twice", () => {
    const registered = [pilot, { roadCode: "PE-18", segmentCount: 285, weatherGridCount: 200 }];
    expect(
      admitForecastRoad({ roadCode: "PE-18", segmentCount: 285, weatherGridCount: 210 }, registered)
        .ok,
    ).toBe(true);
  });
});
