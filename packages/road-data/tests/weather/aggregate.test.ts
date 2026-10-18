import { expect, it } from "vitest";
import {
  weatherCaptureSchema,
  type WeatherCapture,
} from "../../src/contracts/catchment-weather.ts";
import { aggregateRain, summarizeOperationalWeather } from "../../src/domain/weather/aggregate.ts";
const anchor = Date.parse("2026-10-18T05:00:00Z");
export function capture(): WeatherCapture {
  const timesUtc = Array.from({ length: 241 }, (_, index) =>
    new Date(anchor + (index - 168) * 3_600_000).toISOString(),
  );
  return weatherCaptureSchema.parse({
    schemaVersion: 1,
    geometryRevision: "a".repeat(64),
    capturedAt: new Date(anchor).toISOString(),
    kind: "operational",
    model: "ecmwf_ifs025",
    nominalGridResolutionKm: 25,
    forecastIssuedAt: null,
    issueTimeStatus: "not_supplied_by_endpoint",
    precipitationUnit: "mm",
    timeSemantics: "preceding_hour",
    sourceUrls: ["https://example.test/weather"],
    grids: [
      {
        id: "a",
        position: [-77, -12],
        elevationM: 100,
        timesUtc,
        values: { precipitation: timesUtc.map(() => 1) },
      },
      {
        id: "b",
        position: [-76.75, -12],
        elevationM: 200,
        timesUtc,
        values: { precipitation: timesUtc.map(() => 3) },
      },
    ],
    catchments: [
      {
        catchmentId: "basin",
        gridWeights: [
          { gridId: "a", weight: 0.25 },
          { gridId: "b", weight: 0.75 },
        ],
      },
    ],
    limitations: ["Coarse sampling"],
  });
}
it("uses area weights and exact UTC hour-end windows across Lima midnight", () => {
  const value = capture();
  expect(aggregateRain(value, "basin", "precipitation", anchor, anchor + 24 * 3_600_000)).toEqual({
    ok: true,
    precipitationMm: 60,
    hours: 24,
  });
  const summary = summarizeOperationalWeather(value, anchor)[0];
  expect(summary?.rainMm168hPast).toEqual({ ok: true, precipitationMm: 420, hours: 168 });
  expect(summary?.rainMm72hForecast).toEqual({ ok: true, precipitationMm: 180, hours: 72 });
  expect(summary?.sixHourForecasts).toHaveLength(12);
});
it("does not renormalize missing cells or convert null rainfall to dry weather", () => {
  const value = capture();
  const grid = value.grids[1];
  if (!grid?.values.precipitation) throw new Error("Missing test grid");
  grid.values.precipitation[170] = null;
  expect(aggregateRain(value, "basin", "precipitation", anchor, anchor + 24 * 3_600_000)).toEqual({
    ok: false,
    error: "missing_hours",
  });
  expect(aggregateRain(value, "absent", "precipitation", anchor, anchor + 3_600_000)).toEqual({
    ok: false,
    error: "unknown_catchment",
  });
});
it("rejects invalid units, duplicated hours, invalid weights and invented issue time", () => {
  const value = capture();
  expect(weatherCaptureSchema.safeParse({ ...value, precipitationUnit: "inches" }).success).toBe(
    false,
  );
  expect(
    weatherCaptureSchema.safeParse({ ...value, forecastIssuedAt: value.capturedAt }).success,
  ).toBe(false);
  const grid = value.grids[0];
  if (!grid) throw new Error("Missing test grid");
  grid.timesUtc[1] = grid.timesUtc[0] ?? "";
  expect(weatherCaptureSchema.safeParse(value).success).toBe(false);
  const weights = capture();
  const basin = weights.catchments[0];
  if (!basin) throw new Error("Missing test basin");
  basin.gridWeights = [{ gridId: "a", weight: 0.5 }];
  expect(weatherCaptureSchema.safeParse(weights).success).toBe(false);
});
