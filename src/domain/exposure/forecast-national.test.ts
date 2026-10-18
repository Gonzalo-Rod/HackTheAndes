import { describe, expect, it } from "vitest";
import type { ForecastEvent, ForecastProjection, ForecastWindow } from "./forecast-events";
import { roadCodeOf } from "./forecast-events";
import { mergeForecastMaps, mergeForecastProjections } from "./forecast-national";

const FROM = "2026-10-18T12:00:00.000Z";
const UNTIL = "2026-10-18T18:00:00.000Z";
const LATER = "2026-10-18T18:00:00.000Z";

function event(roadCode: string, category: ForecastEvent["category"], startKm: number): ForecastEvent {
  return {
    id: `forecast:${FROM}:${roadCode}:rev:${startKm}:${category}`,
    type: "possible_huaico",
    roadCode,
    category,
    validFrom: FROM,
    validUntil: UNTIL,
    startKm,
    endKm: startKm + 1,
    segmentIds: [`${roadCode}:rev:${startKm}`],
    rainMm: 8,
    highSusceptibilityFraction: 0.5,
    reasons: [],
  };
}
function window(validFrom: string, events: ForecastEvent[], assessed: number, unknown = 0): ForecastWindow {
  return { id: validFrom, validFrom, validUntil: UNTIL, events, assessedSegments: assessed, unknownSegments: unknown };
}
function ready(windows: ForecastWindow[], capturedAt: string): ForecastProjection {
  return { state: "ready", message: "ok", geometryRevision: "a".repeat(64), capturedAt, windows };
}
const unavailable: ForecastProjection = {
  state: "unavailable",
  message: "Evaluación desactualizada",
  geometryRevision: null,
  capturedAt: null,
  windows: [],
};

describe("mergeForecastProjections", () => {
  it("joins windows that start together and ranks high attention first across roads", () => {
    const merged = mergeForecastProjections([
      { roadCode: "PE-22", projection: ready([window(FROM, [event("PE-22", "priority", 4)], 174, 0)], "2026-10-18T11:05:00.000Z") },
      {
        roadCode: "PE-3N",
        projection: ready([window(FROM, [event("PE-3N", "high_attention", 90)], 1900, 80)], "2026-10-18T11:00:00.000Z"),
      },
    ]);
    expect(merged.state).toBe("ready");
    expect(merged.windows).toHaveLength(1);
    expect(merged.windows[0]?.events.map((item) => item.roadCode)).toEqual(["PE-3N", "PE-22"]);
    expect(merged.windows[0]).toMatchObject({ assessedSegments: 2074, unknownSegments: 80 });
    // The oldest road capture is the one the combined view can vouch for.
    expect(merged.capturedAt).toBe("2026-10-18T11:00:00.000Z");
    expect(merged.geometryRevision).toBeNull();
  });

  it("keeps an unavailable road visible in coverage without counting it as low risk", () => {
    const merged = mergeForecastProjections([
      { roadCode: "PE-22", projection: ready([window(FROM, [], 174)], "2026-10-18T11:05:00.000Z") },
      { roadCode: "PE-5N", projection: unavailable },
    ]);
    expect(merged.coverage).toEqual([
      { roadCode: "PE-22", state: "ready", message: "ok" },
      { roadCode: "PE-5N", state: "unavailable", message: "Evaluación desactualizada" },
    ]);
    expect(merged.windows[0]).toMatchObject({ assessedSegments: 174, unknownSegments: 0 });
  });

  it("is unavailable when no road is ready", () => {
    const merged = mergeForecastProjections([{ roadCode: "PE-5N", projection: unavailable }]);
    expect(merged).toMatchObject({ state: "unavailable", windows: [], message: "Evaluación desactualizada" });
  });

  it("orders windows chronologically even when roads list them differently", () => {
    const merged = mergeForecastProjections([
      { roadCode: "PE-22", projection: ready([window(LATER, [], 1)], FROM) },
      { roadCode: "PE-3N", projection: ready([window(FROM, [], 1)], FROM) },
    ]);
    expect(merged.windows.map((item) => item.id)).toEqual([FROM, LATER]);
  });

  it("does not mutate the per-road projections", () => {
    const pilot = ready([window(FROM, [event("PE-22", "priority", 1)], 10)], FROM);
    mergeForecastProjections([
      { roadCode: "PE-22", projection: pilot },
      { roadCode: "PE-3N", projection: ready([window(FROM, [event("PE-3N", "priority", 2)], 5)], FROM) },
    ]);
    expect(pilot.windows[0]?.events).toHaveLength(1);
    expect(pilot.windows[0]?.assessedSegments).toBe(10);
  });
});

describe("mergeForecastMaps", () => {
  it("concatenates features, merges bounds and deduplicates messages", () => {
    const feature = (id: string) => ({
      type: "Feature" as const,
      id,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [-76, -12],
          [-76.01, -12.01],
        ] as [number, number][],
      },
      properties: { eventId: "", category: "watch" },
    });
    const merged = mergeForecastMaps([
      { data: { type: "FeatureCollection", features: [feature("a")] }, bounds: { e1: [0, 0, 1, 1] }, message: "falta" },
      { data: { type: "FeatureCollection", features: [feature("b")] }, bounds: { e2: [1, 1, 2, 2] }, message: "falta" },
    ]);
    expect(merged.data.features.map((item) => item.id)).toEqual(["a", "b"]);
    expect(Object.keys(merged.bounds)).toEqual(["e1", "e2"]);
    expect(merged.message).toBe("falta");
  });
});

describe("roadCodeOf", () => {
  it("reads the road code from a package segment id", () => {
    expect(roadCodeOf(`PE-1NÑ:${"b".repeat(64)}:00012`)).toBe("PE-1NÑ");
  });
});
