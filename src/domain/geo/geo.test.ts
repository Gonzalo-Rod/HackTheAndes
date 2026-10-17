import { describe, expect, it } from "vitest";

import { buildMeasuredCorridor, mergeParts } from "./corridor-builder";
import { bearingDeg, haversineKm, pointAtKm, projectOnMeasuredLine, sliceByKm, type MeasuredVertex } from "./measure";
import { dedupeConsecutive, roundCoord, simplifyLine } from "./simplify";

// A straight east-west line along the equator: 0.01° ≈ 1.112 km.
const line: MeasuredVertex[] = [
  [0, 0, 0],
  [0.01, 0, 1],
  [0.02, 0, 2],
];

describe("measure", () => {
  it("computes great-circle distances and bearings", () => {
    expect(haversineKm([0, 0], [0.01, 0])).toBeCloseTo(1.112, 2);
    expect(bearingDeg([0, 0], [1, 0])).toBeCloseTo(90, 5);
    expect(bearingDeg([0, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("projects a point onto the measured line", () => {
    const projection = projectOnMeasuredLine([0.015, 0.001], line);
    expect(projection.km).toBeCloseTo(1.5, 5);
    expect(projection.distanceKm).toBeCloseTo(0.111, 2);
  });

  it("clamps projections and positions to the line ends", () => {
    expect(projectOnMeasuredLine([-1, 0], line).km).toBe(0);
    expect(pointAtKm(line, -5)).toEqual([0, 0]);
    expect(pointAtKm(line, 99)).toEqual([0.02, 0]);
    expect(pointAtKm(line, 0.5)).toEqual([0.005, 0]);
  });

  it("slices a stretch between two kilometers", () => {
    expect(sliceByKm(line, 0.5, 1.5)).toEqual([
      [0.005, 0],
      [0.01, 0],
      [0.015, 0],
    ]);
  });
});

describe("corridor builder", () => {
  it("merges unordered parts into one polyline", () => {
    const merged = mergeParts([
      [
        [0.02, 0],
        [0.03, 0],
      ],
      [
        [0, 0],
        [0.01, 0],
      ],
      [
        [0.02, 0],
        [0.01, 0],
      ],
    ]);
    expect(merged.map((p) => p[0])).toEqual([0, 0.01, 0.01, 0.02, 0.02, 0.03]);
  });

  it("orients reversed segments and measures them by their km range", () => {
    const { line: measured, maxGapKm } = buildMeasuredCorridor([
      { kmStart: 10, kmEnd: 20, parts: [[[0.02, 0], [0.01, 0]]] },
      { kmStart: 0, kmEnd: 10, parts: [[[0, 0], [0.01, 0]]] },
    ]);
    expect(measured.map((v) => v[2])).toEqual([0, 10, 10, 20]);
    expect(measured.at(-1)?.[0]).toBe(0.02);
    expect(maxGapKm).toBe(0);
  });

  it("signals unusable input", () => {
    expect(buildMeasuredCorridor([]).line).toEqual([]);
  });
});

describe("simplify", () => {
  it("drops collinear points within tolerance and keeps corners", () => {
    expect(
      simplifyLine(
        [
          [0, 0],
          [1, 0.00001],
          [2, 0],
          [2, 1],
        ],
        0.001,
      ),
    ).toEqual([
      [0, 0],
      [2, 0],
      [2, 1],
    ]);
  });

  it("rounds and dedupes coordinates", () => {
    expect(roundCoord([-76.123456, -11.987654], 4)).toEqual([-76.1235, -11.9877]);
    expect(dedupeConsecutive([[1, 1], [1, 1], [2, 2]])).toEqual([[1, 1], [2, 2]]);
  });
});
