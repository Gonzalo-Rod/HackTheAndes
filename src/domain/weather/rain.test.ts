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

  const anchorSec = Date.parse("2026-10-18T05:00:00Z") / 1000; // Midnight in Lima.
  const times = Array.from({ length: 50 }, (_, index) => anchorSec + (index - 24) * 3600);
  const values = times.map((time) => (time <= anchorSec ? 1 : 2));

  it("includes exactly 24 complete past and future hours, ignoring values outside them", () => {
    expect(splitRainWindow(times, values, anchorSec + 1800)).toEqual({ ok: true, value: { pastMm: 24, nextMm: 48 } });
  });

  it("accepts an explicitly measured model zero", () => {
    expect(
      splitRainWindow(
        times,
        values.map(() => 0),
        anchorSec,
      ),
    ).toEqual({ ok: true, value: { pastMm: 0, nextMm: 0 } });
  });

  it("rejects missing, null, duplicate and malformed hours rather than inventing dry weather", () => {
    const missingValue = [...values] as (number | null)[];
    missingValue[12] = null;
    expect(splitRainWindow(times, missingValue, anchorSec).ok).toBe(false);
    expect(
      splitRainWindow(
        times.filter((_, i) => i !== 12),
        values.filter((_, i) => i !== 12),
        anchorSec,
      ).ok,
    ).toBe(false);
    expect(splitRainWindow(times, values.slice(1), anchorSec).ok).toBe(false);
    expect(splitRainWindow([...times, times[1]], [...values, 1], anchorSec).ok).toBe(false);
    expect(
      splitRainWindow(
        times.map((time) => time + 1),
        values,
        anchorSec,
      ).ok,
    ).toBe(false);
    expect(
      splitRainWindow(
        times,
        values.map(() => -1),
        anchorSec,
      ).ok,
    ).toBe(false);
    expect(
      splitRainWindow(
        times,
        values.map(() => Number.NaN),
        anchorSec,
      ).ok,
    ).toBe(false);
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
