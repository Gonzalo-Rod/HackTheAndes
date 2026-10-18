import { expect, it } from "vitest";
import { buildDatabaseCorridor } from "./database-corridor";
import type { CorridorData } from "@/contracts/corridor";
import type { SegmentCollection } from "@/contracts/platform";
const revision = "a".repeat(64);
const bundled: CorridorData = {
  road: "PE-22",
  name: "Test",
  kmTotal: 100,
  line: [
    [-77, -12, 0],
    [-76.98, -12, 100],
  ],
  segments: [],
  kmMarkers: [],
  places: [{ name: "Synthetic place", km: 50, lng: -76.99, lat: -12, offsetKm: 0, elevationM: 100 }],
  profile: [
    { km: 0, elevationM: 100 },
    { km: 100, elevationM: 200 },
  ],
  metadata: { retrievedAt: "2026-10-17T00:00:00Z", geometry: "test", elevation: "test", places: "test", attribution: [] },
};
const collection: SegmentCollection = {
  type: "FeatureCollection",
  geometryRevision: revision,
  retrievedAt: "2026-10-17T00:00:00Z",
  distanceReference: "geometry_distance",
  features: [0, 1].map((index) => ({
    type: "Feature",
    id: `segment-${index}`,
    properties: {
      startDistanceKm: index,
      endDistanceKm: index + 1,
      elevationM: 100 + index,
      officialKmStart: null,
      officialKmEnd: null,
      kilometerCalibration: "unverified",
    },
    geometry: {
      type: "LineString",
      coordinates: [
        [-77 + index * 0.01, -12],
        [-77 + (index + 1) * 0.01, -12],
      ],
    },
  })),
};
it("uses C's distance scale, terrain estimates and revision without inventing calibrated kilometers", () => {
  const corridor = buildDatabaseCorridor(collection, bundled);
  expect(corridor.kmTotal).toBe(2);
  expect(corridor.line.at(-1)?.[2]).toBe(2);
  expect(corridor.places[0]?.km).toBeCloseTo(1);
  expect(corridor.profile).toHaveLength(2);
  expect(corridor.metadata.geometryRevision).toBe(revision);
  expect(corridor.metadata.geometry).toContain("unverified");
});
it("rejects empty geometry and unavailable terrain rather than assigning zero elevation", () => {
  expect(() => buildDatabaseCorridor({ ...collection, features: [] }, bundled)).toThrow();
  expect(() =>
    buildDatabaseCorridor(
      {
        ...collection,
        features: collection.features.map((feature) => ({ ...feature, properties: { ...feature.properties, elevationM: null } })),
      },
      bundled,
    ),
  ).toThrow();
});
