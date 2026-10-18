import { describe, expect, it } from "vitest";
import { assessWindow, combineWindows, includePeak } from "../../src/domain/exposure/window.ts";
import { DEFAULT_EXPOSURE_POLICY as policy } from "../../src/domain/exposure/policy.ts";
const rain = (precipitationMm: number, hours = 6) => ({
  ok: true as const,
  precipitationMm,
  hours,
});
const base = {
  validFrom: "2026-10-17T23:00:00.000Z",
  horizonHours: 6 as const,
  rain: rain(0),
  coverageFraction: 1,
  highFraction: 0.2,
  past72h: rain(0, 72),
  past168h: rain(0, 168),
  policy,
};
describe("experimental climate attention rules", () => {
  it.each([
    [0, "routine"],
    [0.999, "routine"],
    [1, "priority"],
    [4.999, "priority"],
    [5, "high_attention"],
    [10, "high_attention"],
  ])("classifies six-hour rainfall %s on susceptible terrain as %s", (amount, category) => {
    expect(assessWindow({ ...base, rain: rain(amount) }).category).toBe(category);
  });
  it.each([24, 72] as const)(
    "uses the %s-hour rainfall thresholds without changing units",
    (horizonHours) => {
      const threshold = policy.thresholds[String(horizonHours) as "24" | "72"][0];
      expect(
        assessWindow({ ...base, horizonHours, rain: rain(threshold - 0.001, horizonHours) })
          .category,
      ).toBe("routine");
      expect(
        assessWindow({ ...base, horizonHours, rain: rain(threshold, horizonHours) }).category,
      ).toBe("priority");
    },
  );
  it("caps rainfall-only attention and tests the susceptible-area boundary", () => {
    expect(assessWindow({ ...base, rain: rain(100), highFraction: 0.199999 }).category).toBe(
      "watch",
    );
    expect(assessWindow({ ...base, rain: rain(1), highFraction: 0.2 }).category).toBe("priority");
  });
  it("uses antecedent thresholds inclusively without making dry forecasts hazardous", () => {
    expect(assessWindow({ ...base, rain: rain(1), past72h: rain(29.999) }).category).toBe(
      "priority",
    );
    expect(assessWindow({ ...base, rain: rain(1), past72h: rain(30) }).category).toBe(
      "high_attention",
    );
    expect(assessWindow({ ...base, rain: rain(1), past168h: rain(70) }).category).toBe(
      "high_attention",
    );
    expect(assessWindow({ ...base, rain: rain(0), past72h: rain(100) }).category).toBe("routine");
  });
  it("requires susceptibility coverage and preserves unknown rainfall", () => {
    expect(assessWindow({ ...base, coverageFraction: 0.9 }).state).toBe("assessed");
    expect(assessWindow({ ...base, coverageFraction: 0.899 }).category).toBeNull();
    expect(assessWindow({ ...base, coverageFraction: null }).reasons).toContain(
      "missing_susceptibility",
    );
    const missing = { ok: false as const, error: "missing_hours" as const };
    expect(assessWindow({ ...base, rain: missing }).forecastRain).toEqual(missing);
    expect(assessWindow({ ...base, past72h: missing }).category).toBeNull();
  });
  it("keeps a short rain burst visible in a long window", () => {
    const summary = assessWindow({ ...base, horizonHours: 24, rain: rain(3, 24) });
    const peak = assessWindow({ ...base, rain: rain(3) });
    const actual = includePeak(summary, [peak]);
    expect(summary.category).toBe("routine");
    expect(actual.category).toBe("priority");
    expect(actual.forecastRain).toEqual(rain(3, 24));
    expect(actual.reasons).toContain("peak_six_hour_attention");
  });
  it("propagates uncertainty across linked catchments and takes maximum attention/rainfall", () => {
    const known = assessWindow({ ...base, rain: rain(2) });
    const unknown = assessWindow({ ...base, coverageFraction: null });
    expect(combineWindows([], unknown).reasons).toEqual(["no_catchment_link"]);
    expect(combineWindows([known, unknown], unknown).category).toBeNull();
    const wet = assessWindow({ ...base, rain: rain(7) });
    expect(combineWindows([known, wet], unknown)).toMatchObject({
      category: "high_attention",
      forecastRain: rain(7),
    });
  });
});
