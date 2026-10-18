import { describe, expect, it } from "vitest";
import { syntheticWeeklyReport } from "@/test-fixtures/weekly-report";
import { exposureShares, kilometerTicks, niceCeiling, rainAxis, rainBlocks, rainChart, wettestBlocks } from "./report-visuals";

const stretch = (startKm: number, endKm: number, rainMmPeriod: number | null, rainMmNext72h: number | null) => ({
  startKm,
  endKm,
  rainMmPeriod,
  rainMmNext72h,
});

describe("exposureShares", () => {
  it("orders categories from no signal to missing data and sums to one", () => {
    const shares = exposureShares({ routine: 10, watch: 8, priority: 15, high_attention: 5, unknown: 136 });
    expect(shares.map((share) => share.key)).toEqual(["routine", "watch", "priority", "high_attention", "unknown"]);
    expect(shares.reduce((sum, share) => sum + share.fraction, 0)).toBeCloseTo(1);
  });

  it("returns zero fractions instead of NaN for an empty assessment", () => {
    const shares = exposureShares({ routine: 0, watch: 0, priority: 0, high_attention: 0, unknown: 0 });
    expect(shares.every((share) => share.fraction === 0)).toBe(true);
  });
});

describe("axis helpers", () => {
  it.each([
    [0, 1],
    [-3, 1],
    [0.7, 1],
    [3, 5],
    [12.5, 20],
    [24, 25],
  ])("niceCeiling(%s) = %s", (value, expected) => expect(niceCeiling(value)).toBe(expected));

  it("uses round gridline steps that cover the largest value", () => {
    expect(rainAxis(24)).toEqual({ stepMm: 10, maxMm: 30 });
    expect(rainAxis(12.5)).toEqual({ stepMm: 5, maxMm: 15 });
    expect(rainAxis(0)).toEqual({ stepMm: 1, maxMm: 1 });
  });

  it("spaces kilometer ticks across the range, with decimals only for short ranges", () => {
    expect(kilometerTicks(0, 174)).toEqual([0, 44, 87, 131, 174]);
    expect(kilometerTicks(10, 12)).toEqual([10, 10.5, 11, 11.5, 12]);
    expect(kilometerTicks(5, 5)).toEqual([5]);
  });
});

describe("rainBlocks", () => {
  it("keeps the highest value per block, never a sum", () => {
    const blocks = rainBlocks([stretch(0, 5, 2, 4), stretch(5, 10, 3, 1)], 10);
    expect(blocks).toEqual([{ startKm: 0, endKm: 10, rainMmPeriod: 3, rainMmNext72h: 4, partial: false }]);
  });

  it("splits at the block length and at gaps without linked stretches", () => {
    const blocks = rainBlocks([stretch(0, 6, 1, 1), stretch(6, 12, 1, 1), stretch(20, 22, 1, 1)], 10);
    expect(blocks.map((block) => [block.startKm, block.endKm])).toEqual([
      [0, 6],
      [6, 12],
      [20, 22],
    ]);
  });

  it("marks partially missing blocks and keeps fully missing ones as no data", () => {
    const [partial, missing] = rainBlocks([stretch(0, 1, null, 5), stretch(1, 2, 2, 5), stretch(30, 31, null, null)], 10);
    expect(partial).toMatchObject({ rainMmPeriod: 2, rainMmNext72h: 5, partial: true });
    expect(missing).toMatchObject({ rainMmPeriod: null, rainMmNext72h: null, partial: false });
  });
});

describe("report charts", () => {
  it("returns no chart for older reports without per-kilometer rainfall", () => {
    const report = syntheticWeeklyReport();
    delete report.outlook.rainfallStretches;
    expect(rainChart(report)).toBeNull();
    expect(wettestBlocks(report)).toEqual([]);
  });

  it("scales the chart to the wettest value and lists the wettest blocks first", () => {
    const report = syntheticWeeklyReport();
    report.outlook.rainfallStretches = [stretch(0, 10, 1, 3), stretch(20, 30, null, 18), stretch(40, 50, 2, 0)];
    expect(rainChart(report)).toMatchObject({ startKm: 0, endKm: 174, maxMm: 20, stepMm: 5 });
    expect(wettestBlocks(report).map((block) => block.rainMmNext72h)).toEqual([18, 3]);
  });
});
