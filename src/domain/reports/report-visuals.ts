import type { EnvironmentalReport, ReportRainfallStretch } from "@peruroad/road-data/reports";

// Pure layout math for the weekly environmental PDF charts. Drawing lives in src/integrations/pdf/.

export type ExposureKey = keyof EnvironmentalReport["outlook"]["kilometers"];

/** Display order runs from no signal to the highest attention, then missing data last. */
export const EXPOSURE_ORDER: readonly ExposureKey[] = ["routine", "watch", "priority", "high_attention", "unknown"];

export const EXPOSURE_LABELS: Record<ExposureKey, string> = {
  routine: "Sin señal elevada",
  watch: "Vigilancia",
  priority: "Atención prioritaria",
  high_attention: "Atención alta",
  unknown: "Sin datos suficientes",
};

export interface ExposureShare {
  key: ExposureKey;
  label: string;
  km: number;
  fraction: number;
}

/** Shares of the route by category; an all-zero assessment yields zero fractions, never NaN. */
export function exposureShares(kilometers: EnvironmentalReport["outlook"]["kilometers"]): ExposureShare[] {
  const totalKm = EXPOSURE_ORDER.reduce((sum, key) => sum + kilometers[key], 0);
  return EXPOSURE_ORDER.map((key) => ({
    key,
    label: EXPOSURE_LABELS[key],
    km: kilometers[key],
    fraction: totalKm > 0 ? kilometers[key] / totalKm : 0,
  }));
}

/** Rounds an axis maximum up to 1, 2, 2.5 or 5 × 10^n so tick labels stay readable. */
export function niceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** Detail rows group the route into blocks of at most this length so the table stays about one page. */
export const RAIN_BLOCK_KM = 10;

export interface RainAxis {
  maxMm: number;
  stepMm: number;
}

/** Four or five gridlines at round values (0, 5, 10…); the maximum is at least one step. */
export function rainAxis(maxValueMm: number): RainAxis {
  const stepMm = niceCeiling(maxValueMm / 4);
  return { stepMm, maxMm: stepMm * Math.max(1, Math.ceil(maxValueMm / stepMm)) };
}

export interface RainChart extends RainAxis {
  startKm: number;
  endKm: number;
  bars: readonly ReportRainfallStretch[];
}

/** Null when the report predates per-kilometer rainfall or has no linked stretches to draw. */
export function rainChart(report: EnvironmentalReport): RainChart | null {
  const stretches = report.outlook.rainfallStretches;
  if (!stretches?.length) return null;
  const values = stretches.flatMap((stretch) => [stretch.rainMmPeriod, stretch.rainMmNext72h]).filter((mm) => mm !== null);
  return { startKm: report.range.startKm, endKm: report.range.endKm, bars: stretches, ...rainAxis(Math.max(0, ...values)) };
}

export interface RainBlock {
  startKm: number;
  endKm: number;
  /** Highest value among the block's stretches; null only when every stretch lacks data. */
  rainMmPeriod: number | null;
  rainMmNext72h: number | null;
  /** Some stretches in the block lack a value, so the maximum may be understated. */
  partial: boolean;
}

function maxOrNull(values: readonly (number | null)[]): number | null {
  const known = values.filter((value) => value !== null);
  return known.length ? Math.max(...known) : null;
}

/**
 * Groups contiguous stretches into blocks of at most `blockKm`, keeping the maximum (the same
 * "highest linked value, never a sum" rule as the stretches). Gaps without linked stretches split blocks.
 */
export function rainBlocks(stretches: readonly ReportRainfallStretch[], blockKm = RAIN_BLOCK_KM): RainBlock[] {
  const groups: ReportRainfallStretch[][] = [];
  for (const stretch of stretches) {
    const current = groups.at(-1);
    const first = current?.[0];
    const last = current?.at(-1);
    if (current && first && last && Math.abs(stretch.startKm - last.endKm) < 1e-6 && stretch.endKm - first.startKm <= blockKm + 1e-6)
      current.push(stretch);
    else groups.push([stretch]);
  }
  return groups.map((group) => {
    const period = group.map((stretch) => stretch.rainMmPeriod);
    const next = group.map((stretch) => stretch.rainMmNext72h);
    return {
      startKm: group[0]?.startKm ?? 0,
      endKm: group.at(-1)?.endKm ?? 0,
      rainMmPeriod: maxOrNull(period),
      rainMmNext72h: maxOrNull(next),
      partial: [...period, ...next].some((value) => value === null) && [...period, ...next].some((value) => value !== null),
    };
  });
}

/** Five evenly spaced kilometer ticks, rounded to whole kilometers when the range allows it. */
export function kilometerTicks(startKm: number, endKm: number, count = 5): number[] {
  const spanKm = endKm - startKm;
  if (spanKm <= 0) return [startKm];
  return Array.from({ length: count }, (_, index) => {
    const km = startKm + (spanKm * index) / (count - 1);
    return spanKm >= count ? Math.round(km) : Math.round(km * 10) / 10;
  });
}

/** The wettest forecast blocks, for a short "where it will rain most" line under the chart. */
export function wettestBlocks(report: EnvironmentalReport, limit = 3): (RainBlock & { rainMmNext72h: number })[] {
  return rainBlocks(report.outlook.rainfallStretches ?? [])
    .filter((block): block is RainBlock & { rainMmNext72h: number } => (block.rainMmNext72h ?? 0) > 0)
    .sort((a, b) => b.rainMmNext72h - a.rainMmNext72h || a.startKm - b.startKm)
    .slice(0, limit);
}
