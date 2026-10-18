import { expect, it } from "vitest";
import { createCorridorRoute } from "../src/domain/road-data/corridor-route.ts";
const geometryRevision = "a".repeat(64),
  bounds = { startKm: 0, endKm: 174, geometryRevision };
const endpoint = (distanceKm: number) => ({
  distanceKm,
  label: `Km ${distanceKm}`,
  geometryRevision,
});
it("keeps the same PE-22 range in both travel directions and preserves endpoint labels", () => {
  expect(createCorridorRoute(endpoint(50), endpoint(10), bounds)).toEqual({
    ok: true,
    value: { startKm: 10, endKm: 50, geometryRevision, label: "Km 50 → Km 10" },
  });
  expect(createCorridorRoute(endpoint(0), endpoint(174), bounds).ok).toBe(true);
});
it("rejects out-of-coverage, identical, non-finite or different-geometry endpoints", () => {
  expect(createCorridorRoute(endpoint(10), endpoint(175), bounds).ok).toBe(false);
  expect(createCorridorRoute(endpoint(10), endpoint(10), bounds).ok).toBe(false);
  expect(createCorridorRoute(endpoint(NaN), endpoint(20), bounds).ok).toBe(false);
  expect(
    createCorridorRoute({ ...endpoint(10), geometryRevision: "b".repeat(64) }, endpoint(20), bounds)
      .ok,
  ).toBe(false);
});
