import { describe, expect, it } from "vitest";
import {
  classifyOfficialIncident,
  estimatedArrival,
  estimatePositionKm,
  NEARBY_BUFFER_KM,
  prioritizeRouteIncidents,
  type RouteIncident,
  type WatchedTrip,
} from "./prioritize";

const NOW = Date.parse("2026-10-18T05:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

// Huachipa (km 10) to La Oroya (km 170) at 40 km/h, departed one hour ago: truck at km 50.
const trip: WatchedTrip = { id: "trip-1", originKm: 10, destinationKm: 170, departAt: minutesAgo(60), avgSpeedKmh: 40, isTest: false };

function incident(overrides: Partial<RouteIncident> = {}): RouteIncident {
  return {
    key: "community:1",
    source: "community",
    type: "huaico",
    roadStatus: "interrumpido",
    startKm: 75,
    endKm: 76,
    observedAt: minutesAgo(10),
    corroborated: true,
    isTest: false,
    ...overrides,
  };
}

describe("estimatePositionKm", () => {
  it("advances from the origin at the average speed", () => {
    expect(estimatePositionKm(trip, NOW)).toBeCloseTo(50);
  });

  it("moves toward lower distances on a return trip", () => {
    expect(estimatePositionKm({ ...trip, originKm: 170, destinationKm: 10 }, NOW)).toBeCloseTo(130);
  });

  it("stays at the origin before departure and at the destination after arrival", () => {
    expect(estimatePositionKm({ ...trip, departAt: new Date(NOW + 60_000).toISOString() }, NOW)).toBe(10);
    expect(estimatePositionKm({ ...trip, departAt: minutesAgo(24 * 60) }, NOW)).toBe(170);
  });

  it("estimates arrival from route length and speed", () => {
    expect(estimatedArrival(trip)).toBe(new Date(Date.parse(trip.departAt) + 4 * 3_600_000).toISOString());
  });
});

describe("prioritizeRouteIncidents", () => {
  it("calls about a recent huaico ahead of the truck with distance and ETA", () => {
    const [ranked] = prioritizeRouteIncidents(trip, [incident()], NOW);
    expect(ranked).toMatchObject({ placement: "ahead", distanceAheadKm: 25, etaMinutes: 38, callWorthy: true });
    expect(ranked?.reasons.map((item) => item.reason)).toEqual([
      "type:huaico",
      "road_status:interrumpido",
      "placement:ahead",
      "arrival_within_1h",
      "observed_within_3h",
    ]);
  });

  it("ranks a huaico above a closer accident", () => {
    const accident = incident({ key: "community:2", type: "accidente", roadStatus: "restringido", startKm: 55, endKm: 55 });
    const ranked = prioritizeRouteIncidents(trip, [accident, incident()], NOW);
    expect(ranked.map((item) => item.incident.key)).toEqual(["community:1", "community:2"]);
  });

  it("ignores incidents the truck already passed", () => {
    expect(prioritizeRouteIncidents(trip, [incident({ startKm: 20, endKm: 30 })], NOW)).toEqual([]);
  });

  it("keeps an incident that spans the truck's position as ahead at zero distance", () => {
    expect(prioritizeRouteIncidents(trip, [incident({ startKm: 45, endKm: 55 })], NOW)[0]).toMatchObject({
      placement: "ahead",
      distanceAheadKm: 0,
    });
  });

  it("includes incidents just beyond the destination and drops farther ones", () => {
    const near = incident({ startKm: 170 + NEARBY_BUFFER_KM - 1, endKm: 170 + NEARBY_BUFFER_KM - 1 });
    const far = incident({ key: "community:2", startKm: 170 + NEARBY_BUFFER_KM + 1, endKm: 170 + NEARBY_BUFFER_KM + 1 });
    const ranked = prioritizeRouteIncidents(trip, [near, far], NOW);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.placement).toBe("beyond_destination");
  });

  it("does not call about old incidents, normal traffic, uncorroborated reports or minor events", () => {
    const cases = [
      incident({ observedAt: minutesAgo(13 * 60) }),
      incident({ roadStatus: "normal" }),
      incident({ corroborated: false }),
      incident({ type: "obra", roadStatus: "restringido" }),
    ];
    for (const item of cases) expect(prioritizeRouteIncidents(trip, [item], NOW)[0]?.callWorthy).toBe(false);
  });

  it("calls about any closure, whatever the type", () => {
    expect(prioritizeRouteIncidents(trip, [incident({ type: "bloqueo" })], NOW)[0]?.callWorthy).toBe(true);
  });

  it("keeps demonstration incidents away from real trips", () => {
    expect(prioritizeRouteIncidents(trip, [incident({ isTest: true })], NOW)).toEqual([]);
    expect(prioritizeRouteIncidents({ ...trip, isTest: true }, [incident({ isTest: true, corroborated: false })], NOW)[0]?.callWorthy).toBe(
      true,
    );
  });

  it("skips incidents with future or invalid timestamps", () => {
    expect(prioritizeRouteIncidents(trip, [incident({ observedAt: new Date(NOW + 60_000).toISOString() })], NOW)).toEqual([]);
    expect(prioritizeRouteIncidents(trip, [incident({ observedAt: "not a date" })], NOW)).toEqual([]);
  });
});

describe("classifyOfficialIncident", () => {
  it.each([
    ["Huayco", "KM 80 - HUAYCO EN LA VIA", "huaico"],
    ["Fenómeno natural", "Caída de rocas km 95", "derrumbe"],
    ["Accidente", "KM 51 - DESPISTE Y VOLCADURA DE UNA CARRETA", "accidente"],
    ["Social", "Paro de transportistas", "bloqueo"],
    ["", "Trabajos de mantenimiento", "obra"],
    ["", "Evento sin descripción", "otro"],
  ])("classifies %s / %s as %s", (cause, title, expected) => {
    expect(classifyOfficialIncident(cause, title)).toBe(expected);
  });
});
