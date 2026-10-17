import { describe, expect, it } from "vitest";

import type { RainSample } from "@/contracts/weather";

import { classifyRain, rainAtKm, rainBandAtKm, rainSegments, sampleKms, splitRainWindow } from "./rain";

const sample = (km: number, pastMm: number, nextMm: number): RainSample => ({ km, lng: -76, lat: -11, elevationM: 1000, pastMm, nextMm });

describe("rain", () => {
  it("classifies by 24 h thresholds", () => {
    expect(classifyRain(0).level).toBe("seca");
    expect(classifyRain(0.9).level).toBe("seca");
    expect(classifyRain(1).level).toBe("ligera");
    expect(classifyRain(5).level).toBe("moderada");
    expect(classifyRain(40).level).toBe("fuerte");
  });

  it("spaces sample kilometres evenly including both ends", () => {
    expect(sampleKms(100, 5)).toEqual([0, 25, 50, 75, 100]);
  });

  it("splits hourly data around now and treats nulls as zero", () => {
    const result = splitRainWindow([100, 200, 300, 400], [1, null, 2, 3.04], 250);
    expect(result).toEqual({ pastMm: 1, nextMm: 5 });
  });

  it("builds contiguous segments that cover the whole corridor", () => {
    const segments = rainSegments([sample(0, 0, 0), sample(100, 2, 8), sample(200, 0, 20)], 200);
    expect(segments.map((s) => [s.kmStart, s.kmEnd])).toEqual([
      [0, 50],
      [50, 150],
      [150, 200],
    ]);
    expect(segments.map((s) => s.level.level)).toEqual(["seca", "moderada", "fuerte"]);
  });

  it("finds the band containing a kilometre", () => {
    const bands = rainSegments([sample(0, 0, 0), sample(100, 0, 8)], 100);
    expect(rainBandAtKm(bands, 80)?.level.level).toBe("moderada");
    expect(rainBandAtKm([], 80)).toBeNull();
  });

  it("finds the nearest sample", () => {
    const samples = [sample(0, 0, 0), sample(100, 0, 1)];
    expect(rainAtKm(samples, 70)?.km).toBe(100);
    expect(rainAtKm([], 10)).toBeNull();
  });
});
