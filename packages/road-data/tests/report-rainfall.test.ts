import { describe, expect, it } from "vitest";
import { buildRainfallStretches } from "../src/domain/reports/rainfall.ts";
const segment = (startKm: number, endKm: number, catchmentIds: string[] = ["a"]) => ({
  distanceFromOriginStartKm: startKm,
  distanceFromOriginEndKm: endKm,
  catchmentIds,
});
const range = { startKm: 0.25, endKm: 10.5 };
const catchments = [
  { id: "a", rainMmPeriod: 8.93, rainMmNext72h: 24.83 },
  { id: "b", rainMmPeriod: 10.06, rainMmNext72h: 22.81 },
];
describe("driver rainfall stretches", () => {
  it("clips to the selected road range and combines adjacent equal displayed rainfall", () => {
    expect(
      buildRainfallStretches([segment(1, 2), segment(0, 1), segment(10, 11)], range, catchments),
    ).toEqual([
      { startKm: 0.25, endKm: 2, rainMmPeriod: 8.9, rainMmNext72h: 24.8 },
      { startKm: 10, endKm: 10.5, rainMmPeriod: 8.9, rainMmNext72h: 24.8 },
    ]);
  });
  it("uses the greatest linked rainfall independently per period, never the sum", () => {
    expect(buildRainfallStretches([segment(1, 2, ["a", "b"])], range, catchments)).toEqual([
      { startKm: 1, endKm: 2, rainMmPeriod: 10.1, rainMmNext72h: 24.8 },
    ]);
  });
  it("preserves unknown areas and small gaps instead of implying continuous coverage", () => {
    const result = buildRainfallStretches(
      [segment(0, 1), segment(1, 2, []), segment(2, 3), segment(3.00001, 4), segment(5, 6, ["b"])],
      range,
      catchments,
    );
    expect(result.map(({ startKm, endKm }) => [startKm, endKm])).toEqual([
      [0.25, 1],
      [2, 3],
      [3.00001, 4],
      [5, 6],
    ]);
  });
  it("requires all linked values for each period and keeps genuine zero rainfall", () => {
    const partial = [
      { id: "a", rainMmPeriod: null, rainMmNext72h: 0 },
      { id: "b", rainMmPeriod: 9, rainMmNext72h: 0 },
    ];
    const result = buildRainfallStretches(
      [segment(1, 2, ["a", "b"]), segment(2, 3, ["missing"])],
      range,
      partial,
    );
    expect(result).toEqual([
      { startKm: 1, endKm: 2, rainMmPeriod: null, rainMmNext72h: 0 },
      { startKm: 2, endKm: 3, rainMmPeriod: null, rainMmNext72h: null },
    ]);
    expect(buildRainfallStretches([segment(11, 12)], range, catchments)).toEqual([]);
  });
});
