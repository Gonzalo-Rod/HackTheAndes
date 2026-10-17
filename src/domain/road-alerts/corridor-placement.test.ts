import { describe, expect, it } from "vitest";

import type { CorridorData } from "@/contracts/corridor";
import { SUTRAN_ALERT_PE22, SUTRAN_ALERT_TUMBES } from "@/test/fixtures/sutran";

import { elevationAtKm, nearestPlace, placeAlertsOnCorridor } from "./corridor-placement";
import { normalizeSutranAlert } from "./normalize";

// Small synthetic corridor through the PE-22 fixture alert at (−76.5576, −11.9182).
const corridor: CorridorData = {
  road: "PE-22",
  name: "Carretera Central",
  kmTotal: 2,
  line: [
    [-76.5676, -11.9182, 51],
    [-76.5476, -11.9182, 53],
  ],
  segments: [],
  kmMarkers: [],
  places: [
    { name: "Cocachacra", km: 52.5, lng: -76.55, lat: -11.9182, offsetKm: 0, elevationM: 1404 },
    { name: "Chosica", km: 35.5, lng: -76.69, lat: -11.93, offsetKm: 0, elevationM: 857 },
  ],
  profile: [
    { km: 51, elevationM: 1300 },
    { km: 52, elevationM: 1350 },
    { km: 53, elevationM: 1400 },
  ],
  metadata: { retrievedAt: "", geometry: "", elevation: "", places: "", attribution: [] },
};

const pe22 = normalizeSutranAlert(SUTRAN_ALERT_PE22);
const tumbes = normalizeSutranAlert(SUTRAN_ALERT_TUMBES);
if (!pe22 || !tumbes) throw new Error("fixtures must normalize");

describe("placeAlertsOnCorridor", () => {
  it("places PE-22 alerts by their coordinates", () => {
    const [placed] = placeAlertsOnCorridor([pe22, tumbes], corridor);
    expect(placed.alert.id).toBe(pe22.id);
    expect(placed.km).toBeCloseTo(52, 1);
    expect(placed.offsetKm).toBeLessThan(0.01);
  });

  it("ignores alerts on other roads", () => {
    expect(placeAlertsOnCorridor([tumbes], corridor)).toEqual([]);
  });

  it("rejects a PE-22 alert placed far from the road axis", () => {
    const misplaced = { ...pe22, lat: pe22.lat + 0.05 }; // ≈ 5.5 km north
    expect(placeAlertsOnCorridor([misplaced], corridor)).toEqual([]);
  });
});

describe("corridor lookups", () => {
  it("returns the nearest profile elevation and place", () => {
    expect(elevationAtKm(corridor.profile, 52.4)).toBe(1350);
    expect(nearestPlace(corridor.places, 50)).toMatchObject({ place: { name: "Cocachacra" }, deltaKm: -2.5 });
    expect(nearestPlace([], 50)).toBeNull();
  });
});
