import type { z } from "zod";
import type { rainAggregateSchema } from "../../contracts/catchment-weather.ts";
import type { ExposureCategory, ExposurePolicy, ExposureWindow } from "../../contracts/exposure.ts";
export const CATEGORY_ORDER: ExposureCategory[] = [
  "routine",
  "watch",
  "priority",
  "high_attention",
];
type Rain = z.infer<typeof rainAggregateSchema>;
export function assessWindow(input: {
  validFrom: string;
  horizonHours: 6 | 24 | 72;
  rain: Rain;
  coverageFraction: number | null;
  highFraction: number;
  past72h: Rain;
  past168h: Rain;
  policy: ExposurePolicy;
}): ExposureWindow {
  const {
    validFrom,
    horizonHours,
    rain,
    coverageFraction,
    highFraction,
    past72h,
    past168h,
    policy,
  } = input;
  const reasons: ExposureWindow["reasons"] = [];
  if (!rain.ok) reasons.push("missing_rainfall");
  if (coverageFraction === null) reasons.push("missing_susceptibility");
  else if (coverageFraction + 1e-8 < policy.minimumSusceptibilityCoverage)
    reasons.push("incomplete_susceptibility");
  if (!past72h.ok || !past168h.ok) reasons.push("missing_antecedent_rainfall");
  const base = {
    validFrom,
    validUntil: new Date(Date.parse(validFrom) + horizonHours * 3_600_000).toISOString(),
    horizonHours,
    forecastRain: rain,
  };
  if (reasons.length || !rain.ok || !past72h.ok || !past168h.ok)
    return { ...base, state: "unknown", category: null, reasons };
  let rank = policy.thresholds[String(horizonHours) as "6" | "24" | "72"].filter(
    (threshold) => rain.precipitationMm >= threshold,
  ).length;
  reasons.push(rank === 0 ? "rain_below_attention_threshold" : "rain_attention_threshold");
  if (highFraction < policy.susceptibleAreaFraction) rank = Math.min(rank, 1);
  // Static susceptibility alone and wet antecedents without forecast rain never escalate.
  if (rank > 0 && highFraction >= policy.susceptibleAreaFraction) {
    reasons.push("high_susceptibility_overlap");
    rank = Math.min(3, rank + 1);
    if (
      past72h.precipitationMm >= policy.antecedentRainMm72h ||
      past168h.precipitationMm >= policy.antecedentRainMm168h
    ) {
      reasons.push("antecedent_wet_weather");
      rank = Math.min(3, rank + 1);
    }
  }
  return {
    ...base,
    state: "assessed",
    category: CATEGORY_ORDER[rank] ?? "high_attention",
    reasons,
  };
}
/**
 * Above "watch" only where the road itself crosses terrain of at least `minimumClass`; a segment
 * without local classes cannot be confirmed and is capped the same way, with its own reason.
 */
export function capByLocalSusceptibility(
  window: ExposureWindow,
  localClasses: readonly number[] | undefined,
  minimumClass: number,
): ExposureWindow {
  if (window.state !== "assessed" || window.category === null) return window;
  if (CATEGORY_ORDER.indexOf(window.category) <= CATEGORY_ORDER.indexOf("watch")) return window;
  const known = localClasses !== undefined && localClasses.length > 0;
  if (known && Math.max(...localClasses) >= minimumClass) return window;
  return {
    ...window,
    category: "watch",
    reasons: [
      ...window.reasons.filter(
        (r) => r !== "high_susceptibility_overlap" && r !== "antecedent_wet_weather",
      ),
      known ? "low_local_susceptibility" : "missing_local_susceptibility",
    ],
  };
}

export function combineWindows(
  windows: ExposureWindow[],
  fallback: ExposureWindow,
): ExposureWindow {
  const totals = windows.flatMap((w) =>
    w.forecastRain.ok ? [w.forecastRain.precipitationMm] : [],
  );
  const base = {
    ...fallback,
    forecastRain:
      windows.length > 0 && totals.length === windows.length
        ? { ok: true as const, precipitationMm: Math.max(...totals), hours: fallback.horizonHours }
        : {
            ok: false as const,
            error: windows.length ? ("missing_hours" as const) : ("unknown_catchment" as const),
          },
  };
  if (!windows.length || windows.some((w) => w.state !== "assessed" || w.category === null))
    return {
      ...base,
      state: "unknown",
      category: null,
      reasons: [windows.length ? "incomplete_catchment_assessments" : "no_catchment_link"],
    };
  const rank = Math.max(...windows.map((w) => CATEGORY_ORDER.indexOf(w.category ?? "routine")));
  return {
    ...base,
    state: "assessed",
    category: CATEGORY_ORDER[rank] ?? "high_attention",
    reasons: [...new Set(windows.flatMap((w) => w.reasons))],
  };
}
export function includePeak(summary: ExposureWindow, sixHourly: ExposureWindow[]): ExposureWindow {
  if (summary.state !== "assessed" || !summary.category) return summary;
  if (sixHourly.some((w) => w.state !== "assessed" || !w.category))
    return { ...summary, state: "unknown", category: null, reasons: ["missing_rainfall"] };
  const peak = Math.max(...sixHourly.map((w) => CATEGORY_ORDER.indexOf(w.category ?? "routine")));
  if (peak <= CATEGORY_ORDER.indexOf(summary.category)) return summary;
  return {
    ...summary,
    category: CATEGORY_ORDER[peak] ?? "high_attention",
    reasons: [
      ...new Set([
        ...summary.reasons,
        ...sixHourly.flatMap((w) => w.reasons),
        "peak_six_hour_attention" as const,
      ]),
    ],
  };
}
