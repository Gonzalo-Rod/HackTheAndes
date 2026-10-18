import { describe, expect, it } from "vitest";
import type { NationalRoadEvent } from "@/contracts/road-history";
import { historyForAlert, mappableHistoryEvents, MAX_LISTED_HISTORY_EVENTS, normalizeRoadCode } from "./nearby";

function event(overrides: Partial<NationalRoadEvent> = {}): NationalRoadEvent {
  return {
    id: "provias:1",
    sourceYear: 2025,
    date: "2025-02-10",
    roadCode: "PE-22",
    department: "Lima",
    province: "Huarochirí",
    district: "San Mateo",
    kmStart: 100,
    kmEnd: 100.1,
    position: [-76.3, -11.76],
    category: "debris_flow",
    rawType: "HUAICO",
    initialStatus: "interrumpido",
    rainfallReported: true,
    ...overrides,
  };
}
const alert = { roadCode: "pe-22 ", lat: -11.76, lng: -76.3 };
// 0.01° of latitude ≈ 1.11 km.
const kmNorth = (km: number): [number, number] => [-76.3, -11.76 + km / 111.2];

describe("historyForAlert", () => {
  it("matches the same road within the radius and orders closest first, then newest", () => {
    const events = [
      event({ id: "provias:far", position: kmNorth(4.9), date: "2024-01-01" }),
      event({ id: "provias:new", position: kmNorth(1), date: "2025-03-01" }),
      event({ id: "provias:old", position: kmNorth(1), date: "2024-03-01", initialStatus: "restringido", rainfallReported: false }),
      event({ id: "provias:outside", position: kmNorth(5.2) }),
    ];
    const history = historyForAlert(events, alert);
    expect(history?.closest.map((h) => h.event.id)).toEqual(["provias:new", "provias:old", "provias:far"]);
    expect(history).toMatchObject({
      roadCode: "PE-22",
      sameRoadCount: 4,
      nearbyCount: 3,
      nearbyInterruptedCount: 2,
      nearbyRainfallCount: 2,
    });
  });

  it("ignores nearby events on a different road, such as a crossing", () => {
    const history = historyForAlert([event({ roadCode: "PE-20A" })], alert);
    expect(history).toMatchObject({ sameRoadCount: 0, nearbyCount: 0, closest: [] });
  });

  it("counts same-road events without a position but never places them nearby", () => {
    expect(historyForAlert([event({ position: null })], alert)).toMatchObject({ sameRoadCount: 1, nearbyCount: 0 });
  });

  it("returns null for alerts without a road code", () => {
    expect(historyForAlert([event()], { ...alert, roadCode: "  " })).toBeNull();
  });

  it("lists at most the closest records while counting all matches", () => {
    const events = Array.from({ length: MAX_LISTED_HISTORY_EVENTS + 3 }, (_, i) =>
      event({ id: `provias:${i}`, position: kmNorth(i * 0.1) }),
    );
    const history = historyForAlert(events, alert);
    expect(history?.closest).toHaveLength(MAX_LISTED_HISTORY_EVENTS);
    expect(history?.nearbyCount).toBe(MAX_LISTED_HISTORY_EVENTS + 3);
  });
});

describe("mappableHistoryEvents", () => {
  const events = [event(), event({ id: "provias:2", roadCode: "PE-5N" }), event({ id: "provias:3", position: null })];
  it("keeps every positioned event nationwide, or only the scoped road", () => {
    expect(mappableHistoryEvents(events, null).map((e) => e.id)).toEqual(["provias:1", "provias:2"]);
    expect(mappableHistoryEvents(events, "pe-5n").map((e) => e.id)).toEqual(["provias:2"]);
  });
  it("normalizes road codes from either source", () => {
    expect(normalizeRoadCode(" pe 22 ")).toBe("PE22");
    expect(normalizeRoadCode("pe-3n")).toBe("PE-3N");
  });
});
