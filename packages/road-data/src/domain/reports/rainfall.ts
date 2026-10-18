import type { ReportRainfallStretch } from "../../contracts/weekly-report.ts";
type Rainfall = Pick<ReportRainfallStretch, "rainMmPeriod" | "rainMmNext72h">;
type Segment = {
  distanceFromOriginStartKm: number;
  distanceFromOriginEndKm: number;
  catchmentIds: readonly string[];
};
/** Display precision only; exposure categories continue to use the original model inputs. */
const DISPLAY_RAIN_ROUNDING_FACTOR = 10;
function maximumRain(
  ids: readonly string[],
  catchments: ReadonlyMap<string, Rainfall>,
  field: keyof Rainfall,
): number | null {
  let maximum = 0;
  for (const id of ids) {
    const value = catchments.get(id)?.[field];
    // A partial set cannot establish the maximum for all linked drainage areas.
    if (value === undefined || value === null) return null;
    maximum = Math.max(maximum, value);
  }
  return Math.round(maximum * DISPLAY_RAIN_ROUNDING_FACTOR) / DISPLAY_RAIN_ROUNDING_FACTOR;
}
/** Match the exposure policy's maximum-across-catchments rule, never sum nearby rainfall. */
export function buildRainfallStretches(
  segments: readonly Segment[],
  range: { startKm: number; endKm: number },
  catchments: readonly (Rainfall & { id: string })[],
): ReportRainfallStretch[] {
  const byId = new Map(catchments.map((catchment) => [catchment.id, catchment]));
  const stretches: ReportRainfallStretch[] = [];
  for (const segment of [...segments].sort(
    (a, b) => a.distanceFromOriginStartKm - b.distanceFromOriginStartKm,
  )) {
    const startKm = Math.max(range.startKm, segment.distanceFromOriginStartKm);
    const endKm = Math.min(range.endKm, segment.distanceFromOriginEndKm);
    if (endKm <= startKm || !segment.catchmentIds.length) continue;
    const current = {
      startKm,
      endKm,
      rainMmPeriod: maximumRain(segment.catchmentIds, byId, "rainMmPeriod"),
      rainMmNext72h: maximumRain(segment.catchmentIds, byId, "rainMmNext72h"),
    };
    const previous = stretches.at(-1);
    // Exact shared endpoints preserve every unmapped gap, even very small gaps.
    if (
      previous?.endKm === current.startKm &&
      previous.rainMmPeriod === current.rainMmPeriod &&
      previous.rainMmNext72h === current.rainMmNext72h
    )
      previous.endKm = current.endKm;
    else stretches.push(current);
  }
  return stretches;
}
