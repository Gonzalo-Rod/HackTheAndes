import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { exteriorBoundarySegments } from "./exterior-boundary";

type LngLat = [number, number];
type RegionFeature = {
  geometry: { type: "Polygon"; coordinates: LngLat[][] } | { type: "MultiPolygon"; coordinates: LngLat[][][] };
};
const regions = JSON.parse(readFileSync(new URL("../../../public/data/regiones.geojson", import.meta.url), "utf8")) as {
  features: RegionFeature[];
};
const peruOutline = JSON.parse(readFileSync(new URL("../../../public/data/peru-outline.geojson", import.meta.url), "utf8")) as {
  features: GeoJSON.Feature<GeoJSON.MultiLineString>[];
};

describe("exteriorBoundarySegments", () => {
  it("removes shared department edges and keeps only the combined country perimeter", () => {
    const first = {
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ] as [number, number][],
        ],
      },
    };
    const second = {
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [1, 0],
            [2, 0],
            [2, 1],
            [1, 1],
            [1, 0],
          ] as [number, number][],
        ],
      },
    };

    const result = exteriorBoundarySegments([first, second]);

    expect(result.geometry.type).toBe("MultiLineString");
    expect(result.geometry.coordinates).toHaveLength(6);
    expect(result.geometry.coordinates).not.toContainEqual([
      [1, 0],
      [1, 1],
    ]);
  });

  it("matches the published Peru outline derived from the current 25 department features", () => {
    const features = regions.features.map((feature) => {
      if (feature.geometry.type === "Polygon") {
        return {
          type: "Feature" as const,
          geometry: { type: "Polygon" as const, coordinates: feature.geometry.coordinates },
        };
      }
      if (feature.geometry.type === "MultiPolygon") {
        return {
          type: "Feature" as const,
          geometry: { type: "MultiPolygon" as const, coordinates: feature.geometry.coordinates },
        };
      }
      throw new Error("Region fixture must contain polygons.");
    }) as Parameters<typeof exteriorBoundarySegments>[0];
    const derived = exteriorBoundarySegments(features);

    expect(regions.features).toHaveLength(25);
    expect(peruOutline.features).toHaveLength(1);
    expect(derived.geometry.coordinates).toHaveLength(3035);
    expect(derived.geometry.coordinates).toEqual(peruOutline.features[0].geometry.coordinates);
  });
});
