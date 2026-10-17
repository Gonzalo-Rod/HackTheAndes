import type { RainSample } from "@/contracts/weather";

// Pure rain helpers: classification, windowing of hourly data, and mapping point samples
// onto stretches of the corridor. This is rain intensity, not a landslide (huaico) forecast.

export type RainLevel = "seca" | "ligera" | "moderada" | "fuerte";

export interface RainLevelMeta {
  level: RainLevel;
  label: string;
  /** Lower bound in mm per 24 h (inclusive). */
  minMm: number;
  /** Sequential blue ramp; deliberately distinct from the reserved road-status colors. */
  color: string;
}

export const RAIN_LEVELS: readonly RainLevelMeta[] = [
  { level: "seca", label: "Sin lluvia", minMm: 0, color: "#b9c6cf" },
  { level: "ligera", label: "Lluvia ligera", minMm: 1, color: "#79b4e3" },
  { level: "moderada", label: "Lluvia moderada", minMm: 5, color: "#2f7bd1" },
  { level: "fuerte", label: "Lluvia fuerte", minMm: 15, color: "#1b3a9e" },
];

export function classifyRain(mm: number): RainLevelMeta {
  let found = RAIN_LEVELS[0];
  for (const meta of RAIN_LEVELS) if (mm >= meta.minMm) found = meta;
  return found;
}

/** Worst of the last and next 24 h, so a stretch that just got soaked still shows. */
export function rainPeakMm(sample: Pick<RainSample, "pastMm" | "nextMm">): number {
  return Math.max(sample.pastMm, sample.nextMm);
}

/** Evenly spaced kilometres from 0 to kmTotal, both ends included. */
export function sampleKms(kmTotal: number, count: number): number[] {
  if (count < 2) return [0];
  return Array.from({ length: count }, (_, i) => (kmTotal * i) / (count - 1));
}

/**
 * Splits hourly precipitation into the 24 h before `nowSec` and the 24 h after it.
 * Null readings (missing data) count as zero; all inputs are Unix seconds / millimetres.
 */
export function splitRainWindow(
  timesSec: readonly number[],
  precipitation: readonly (number | null)[],
  nowSec: number,
): { pastMm: number; nextMm: number } {
  let pastMm = 0;
  let nextMm = 0;
  timesSec.forEach((time, i) => {
    const mm = Math.max(0, precipitation[i] ?? 0);
    if (time <= nowSec) pastMm += mm;
    else nextMm += mm;
  });
  return { pastMm: Math.round(pastMm * 10) / 10, nextMm: Math.round(nextMm * 10) / 10 };
}

export interface RainSegment {
  kmStart: number;
  kmEnd: number;
  mm: number;
  level: RainLevelMeta;
}

/** Each stretch takes the value of its nearest sample (boundaries halfway between samples). */
export function rainSegments(samples: readonly RainSample[], kmTotal: number): RainSegment[] {
  const sorted = [...samples].sort((a, b) => a.km - b.km);
  return sorted.map((sample, i) => {
    const kmStart = i === 0 ? 0 : (sorted[i - 1].km + sample.km) / 2;
    const kmEnd = i === sorted.length - 1 ? kmTotal : (sample.km + sorted[i + 1].km) / 2;
    const mm = rainPeakMm(sample);
    return { kmStart, kmEnd, mm, level: classifyRain(mm) };
  });
}

/** The sample nearest to a kilometre, or null when there are none. */
export function rainAtKm(samples: readonly RainSample[], km: number): RainSample | null {
  let best: RainSample | null = null;
  for (const sample of samples) if (!best || Math.abs(sample.km - km) < Math.abs(best.km - km)) best = sample;
  return best;
}

/** The rain stretch that contains a kilometre, or null when there are none. */
export function rainBandAtKm(bands: readonly RainSegment[], km: number): RainSegment | null {
  return bands.find((band) => km >= band.kmStart && km <= band.kmEnd) ?? null;
}
