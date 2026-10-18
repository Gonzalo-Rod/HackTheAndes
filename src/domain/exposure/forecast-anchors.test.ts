import { describe, expect, it } from "vitest";
import { forecastEventAnchors, type ForecastMapData } from "./forecast-map";

const line = (id: string, eventId: string, category: string, coordinates: [number, number][]) => ({
  type: "Feature" as const,
  id,
  geometry: { type: "LineString" as const, coordinates },
  properties: { eventId, category },
});

describe("forecastEventAnchors", () => {
  it("labels each forecast event once, at the middle of its stretch", () => {
    const data: ForecastMapData = {
      type: "FeatureCollection",
      features: [
        line("s1", "forecast:a", "priority", [
          [0, 0],
          [1, 0],
        ]),
        line("s2", "forecast:a", "priority", [
          [1, 0],
          [2, 0],
        ]),
        line("s3", "", "routine", [
          [2, 0],
          [3, 0],
        ]),
        line("s4", "forecast:b", "high_attention", [
          [3, 0],
          [4, 0],
        ]),
      ],
    };
    expect(forecastEventAnchors(data)).toEqual([
      { eventId: "forecast:a", category: "priority", position: [1, 0] },
      { eventId: "forecast:b", category: "high_attention", position: [4, 0] },
    ]);
  });

  it("returns nothing without forecast events", () => {
    expect(forecastEventAnchors({ type: "FeatureCollection", features: [] })).toEqual([]);
  });
});
