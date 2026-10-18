import { beforeAll, describe, it, expect } from "vitest";
import { createExposureView, readBundledExposure } from "@peruroad/road-data/exposure";
import type { ExposureLayer } from "@/contracts/exposure";
import type { SegmentCollection } from "@/contracts/platform";
import { chooseForecastWindow, formatForecastWindow, MAX_FORECAST_EVENT_KM, projectForecastEvents } from "./forecast-events";
import { projectForecastMap } from "./forecast-map";
let original: ExposureLayer;
let now: number;
beforeAll(async () => {
  const record = await readBundledExposure();
  now = Date.parse(record.assessment.assessedAt) + 1000;
  original = createExposureView(record.assessment, now, "database", 72, true);
});
function fixture() {
  const view = structuredClone(original);
  const assessed = view.data.segments.find((s) => s.windows.next24h.state === "assessed");
  if (!assessed) throw new Error("Bundled fixture needs a supported segment");
  // Synthetic spatial arrangement isolates adjacency and unsupported gaps from the real source geometry.
  view.data.segments = Array.from({ length: 3 }, (_, i) => ({
    ...structuredClone(assessed),
    segmentId: `synthetic:${i}`,
    distanceFromOriginStartKm: 10 + i,
    distanceFromOriginEndKm: 11 + i,
    windows: {
      ...structuredClone(assessed.windows),
      sixHourly: assessed.windows.sixHourly.map((w) => ({
        ...w,
        state: "assessed" as const,
        category: "priority" as const,
        forecastRain: { ok: true as const, hours: 6, precipitationMm: 6 },
        reasons: ["high_susceptibility_overlap" as const, "rain_attention_threshold" as const],
      })),
    },
  }));
  return view;
}
function geometry(view: ExposureLayer): SegmentCollection {
  return {
    type: "FeatureCollection",
    geometryRevision: view.data.geometryRevision,
    retrievedAt: view.meta.servedAt,
    distanceReference: "geometry_distance",
    features: view.data.segments.map((s, i) => ({
      type: "Feature",
      id: s.segmentId,
      geometry: {
        type: "LineString",
        coordinates: [
          [-76.1 + i / 100, -11.8],
          [-76.09 + i / 100, -11.79],
        ],
      },
      properties: {
        startDistanceKm: s.distanceFromOriginStartKm,
        endDistanceKm: s.distanceFromOriginEndKm,
        elevationM: null,
        officialKmStart: null,
        officialKmEnd: null,
        kilometerCalibration: "unverified",
      },
    })),
  };
}
describe("dated possible-huaico estimates, separate from reported incidents", () => {
  it("groups only contiguous elevated segments in the same six-hour window", () => {
    const projection = projectForecastEvents(fixture(), now, 24);
    expect(projection.windows).toHaveLength(4);
    const event = projection.windows[0].events[0];
    expect(event).toMatchObject({ type: "possible_huaico", startKm: 10, endKm: 13, category: "priority", rainMm: 6 });
    expect(event.segmentIds).toHaveLength(3);
    expect(Date.parse(event.validUntil) - Date.parse(event.validFrom)).toBe(6 * 3_600_000);
    expect(projection.windows[1].events[0].id).not.toBe(event.id);
  });
  it("never merges across a physical or unknown-coverage gap", () => {
    const view = fixture();
    view.data.segments[1].windows.sixHourly[0] = { ...view.data.segments[1].windows.sixHourly[0], state: "unknown", category: null };
    let window = projectForecastEvents(view, now, 24).windows[0];
    expect(window.events).toHaveLength(2);
    expect(window).toMatchObject({ assessedSegments: 2, unknownSegments: 1 });
    view.data.segments[1].distanceFromOriginStartKm = 20;
    view.data.segments[1].distanceFromOriginEndKm = 21;
    window = projectForecastEvents(view, now, 24).windows[1];
    expect(window.events).toHaveLength(3);
  });
  it("starts a new item where the linked catchments change", () => {
    const view = fixture();
    view.data.segments[2].catchmentIds = ["hydrobasins-v1c-sa12-999"];
    const window = projectForecastEvents(view, now, 24).windows[0];
    expect(window.events.map((e) => [e.startKm, e.endKm])).toEqual([
      [10, 12],
      [12, 13],
    ]);
  });
  it("caps each item at the maximum stretch length", () => {
    const view = fixture();
    const template = view.data.segments[0];
    view.data.segments = Array.from({ length: 23 }, (_, i) => ({
      ...structuredClone(template),
      segmentId: `synthetic:${i}`,
      distanceFromOriginStartKm: i,
      distanceFromOriginEndKm: i + 1,
    }));
    const events = projectForecastEvents(view, now, 24).windows[0].events;
    expect(events.map((e) => [e.startKm, e.endKm])).toEqual([
      [0, MAX_FORECAST_EVENT_KM],
      [MAX_FORECAST_EVENT_KM, 2 * MAX_FORECAST_EVENT_KM],
      [2 * MAX_FORECAST_EVENT_KM, 23],
    ]);
  });
  it("keeps distinct attention levels separate and does not create events for routine/watch", () => {
    const view = fixture();
    view.data.segments[1].windows.sixHourly[0].category = "high_attention";
    view.data.segments[2].windows.sixHourly[0].category = "watch";
    const window = projectForecastEvents(view, now, 24).windows[0];
    expect(window.events.map((e) => e.category)).toEqual(["priority", "high_attention"]);
    expect(window.assessedSegments).toBe(3);
  });
  it("retains maximum linked rainfall, without summing across segments", () => {
    const view = fixture();
    view.data.segments[1].windows.sixHourly[0].forecastRain = {
      ok: true,
      hours: 6,
      precipitationMm: 9,
    };
    expect(projectForecastEvents(view, now, 24).windows[0].events[0].rainMm).toBe(9);
  });
  it("supports 72 hours but never extends captured windows", () => {
    const view = fixture();
    expect(projectForecastEvents(view, now, 72).windows).toHaveLength(12);
    const ended = Date.parse(view.data.segments[0].windows.sixHourly[0].validUntil);
    view.data.sources.weatherCapturedAt = new Date(ended - 1000).toISOString();
    expect(projectForecastEvents(view, ended, 72).windows[0].validFrom).toBe(view.data.segments[0].windows.sixHourly[1].validFrom);
  });
  it("suppresses stale data at the exact freshness deadline and future captures", () => {
    const view = fixture();
    expect(
      projectForecastEvents(view, Date.parse(view.data.sources.weatherCapturedAt) + view.data.policy.weatherMaxAgeMs, 72).windows,
    ).toEqual([]);
    expect(projectForecastEvents(view, Date.parse(view.data.sources.weatherCapturedAt) - 1, 72).state).toBe("unavailable");
    view.data.assessedAt = new Date(now + 1).toISOString();
    expect(projectForecastEvents(view, now, 72).state).toBe("unavailable");
  });
  it("does not turn missing, snapshot or unavailable input into a low-risk result", () => {
    expect(projectForecastEvents(null, now, 24).message).toContain("No implica");
    for (const change of [{ state: "stale" as const }, { operationallyUsable: false }, { storage: "snapshot" as const }]) {
      const view = fixture();
      Object.assign(view.meta, change);
      expect(projectForecastEvents(view, now, 24).windows).toEqual([]);
    }
  });
  it("defaults to the first elevated window but honors an explicitly selected quiet window", () => {
    const view = fixture();
    for (const s of view.data.segments) s.windows.sixHourly[0].category = "routine";
    const projection = projectForecastEvents(view, now, 24);
    expect(chooseForecastWindow(projection, null)?.id).toBe(projection.windows[1].id);
    expect(chooseForecastWindow(projection, projection.windows[0].id)?.events).toEqual([]);
  });
  it("displays both dates across Lima midnight", () => {
    expect(formatForecastWindow({ validFrom: "2026-10-18T02:00:00Z", validUntil: "2026-10-18T08:00:00Z" })).toBe(
      "17/10, 21:00 – 18/10, 03:00 (Perú)",
    );
  });
  it("maps exact segment geometries and gives unknown coverage no event identity", () => {
    const view = fixture();
    view.data.segments[1].windows.sixHourly[0] = { ...view.data.segments[1].windows.sixHourly[0], state: "unknown", category: null };
    const window = projectForecastEvents(view, now, 24).windows[0];
    const map = projectForecastMap(view, geometry(view), window);
    expect(map.data.features).toHaveLength(3);
    expect(map.data.features[1].properties).toEqual({ category: "unknown", eventId: "" });
    expect(map.bounds[window.events[0].id]).toHaveLength(4);
  });
  it("rejects mismatched geometry and disables focus for incompletely mapped events", () => {
    const view = fixture(),
      shapes = geometry(view),
      window = projectForecastEvents(view, now, 24).windows[0];
    const wrong = { ...shapes, geometryRevision: "f".repeat(64) };
    expect(projectForecastMap(view, wrong, window).data.features).toEqual([]);
    shapes.features.pop();
    const partial = projectForecastMap(view, shapes, window);
    expect(partial.message).toContain("1 tramos");
    expect(partial.bounds).toEqual({});
  });
});
