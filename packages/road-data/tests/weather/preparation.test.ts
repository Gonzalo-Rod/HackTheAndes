import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { prepareCatchmentWeather } from "../../src/services/prepare-catchment-weather.ts";
import { weatherCaptureSchema } from "../../src/contracts/catchment-weather.ts";
const catchments: unknown = JSON.parse(
  await readFile(new URL("../../data/pe22/catchments.json", import.meta.url), "utf8"),
);
const now = new Date("2026-10-17T12:00:00Z");
it("combines repeated returned grid cells without counting the same rainfall twice", async () => {
  const value = await prepareCatchmentWeather({
    catchments,
    requestId: "test",
    now,
    query: { kind: "operational" },
    provider: {
      fetchWeather: async (points) => ({
        sourceUrls: ["https://example.test/weather"],
        series: points.map(() => ({
          id: "same-grid",
          position: [-77, -12],
          elevationM: 100,
          timesUtc: [now.toISOString()],
          values: { precipitation: [2] },
        })),
      }),
    },
  });
  expect(value.grids).toHaveLength(1);
  expect(
    value.catchments.every(
      (c) => c.gridWeights.length === 1 && Math.abs((c.gridWeights[0]?.weight ?? 0) - 1) < 1e-8,
    ),
  ).toBe(true);
  expect(weatherCaptureSchema.parse(value).forecastIssuedAt).toBeNull();
});
it("rejects conflicting responses for the same provider grid instead of mixing model updates", async () => {
  await expect(
    prepareCatchmentWeather({
      catchments,
      requestId: "test",
      now,
      query: { kind: "operational" },
      provider: {
        fetchWeather: async (points) => ({
          sourceUrls: ["https://example.test/weather"],
          series: points.map((_, index) => ({
            id: "same-grid",
            position: [-77, -12],
            elevationM: 100,
            timesUtc: [now.toISOString()],
            values: { precipitation: [index] },
          })),
        }),
      },
    }),
  ).rejects.toThrow("conflicting");
});
it("requests each 0.25-degree model cell once when samples are snapped to the grid", async () => {
  let requested: readonly [number, number][] = [];
  const value = await prepareCatchmentWeather({
    catchments,
    requestId: "test",
    now,
    query: { kind: "operational" },
    snapDegrees: 0.25,
    provider: {
      fetchWeather: async (points) => {
        requested = points;
        return {
          sourceUrls: ["https://example.test/weather"],
          series: points.map((point) => ({
            id: point.join(","),
            position: point,
            elevationM: 100,
            timesUtc: [now.toISOString()],
            values: { precipitation: [1] },
          })),
        };
      },
    },
  });
  const keys = requested.map((point) => point.join(","));
  expect(new Set(keys).size).toBe(keys.length);
  expect(
    requested.every(([lon, lat]) => Number.isInteger(lon * 4) && Number.isInteger(lat * 4)),
  ).toBe(true);
  // PE-22 has 170 sample points but far fewer model cells.
  expect(requested.length).toBeLessThan(60);
  expect(
    value.catchments.every(
      (c) => Math.abs(c.gridWeights.reduce((sum, item) => sum + item.weight, 0) - 1) < 1e-8,
    ),
  ).toBe(true);
});
