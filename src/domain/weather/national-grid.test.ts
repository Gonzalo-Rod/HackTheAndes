import { describe, expect, it } from "vitest";
import { gridCentersInside, inPolygon, interpolateRain } from "./national-grid";

const square = [
  [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
    [0, 0],
  ],
  [
    [1, 1],
    [2, 1],
    [2, 2],
    [1, 2],
    [1, 1],
  ],
] as [number, number][][];

describe("national rain grid", () => {
  it("excludes points in holes and outside the outer ring", () => {
    expect(inPolygon([3, 3], square)).toBe(true);
    expect(inPolygon([1.5, 1.5], square)).toBe(false);
    expect(inPolygon([5, 5], square)).toBe(false);
  });

  it("keeps only cell centers inside a polygon", () => {
    const centers = gridCentersInside([square], [0, 0, 4, 4], 1);
    expect(centers).toHaveLength(15);
    expect(centers).not.toContainEqual([1.5, 1.5]);
    expect(centers).toContainEqual([0.5, 0.5]);
  });

  it("rejects a non-positive step", () => {
    expect(() => gridCentersInside([square], [0, 0, 4, 4], 0)).toThrow(RangeError);
  });
});

describe("interpolateRain", () => {
  const coarse = [
    { lng: 0, lat: 0, pastMm: 0, nextMm: 0 },
    { lng: 1, lat: 0, pastMm: 4, nextMm: 8 },
    { lng: 0, lat: 1, pastMm: 0, nextMm: 0 },
    { lng: 1, lat: 1, pastMm: 4, nextMm: 8 },
  ];
  it("blends the four surrounding model cells and keeps exact values at their centers", () => {
    const [mid, corner] = interpolateRain(coarse, 1, [
      [0.25, 0.5],
      [1, 1],
    ]);
    expect(mid).toMatchObject({ pastMm: 1, nextMm: 2 });
    expect(corner).toMatchObject({ pastMm: 4, nextMm: 8 });
  });
  it("renormalizes around missing cells and leaves out centers with no neighbour", () => {
    const sparse = coarse.filter((c) => !(c.lng === 1 && c.lat === 1));
    expect(interpolateRain(sparse, 1, [[0.9, 0.9]])[0]?.nextMm).toBeCloseTo((0.9 * 0.1 * 8) / (1 - 0.81));
    expect(interpolateRain(coarse, 1, [[5, 5]])).toEqual([]);
    expect(interpolateRain([], 1, [[0, 0]])).toEqual([]);
  });
});
