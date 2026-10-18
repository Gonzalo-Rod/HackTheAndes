import type { CorridorData, CorridorPlace } from "@/contracts/corridor";
import type { RoadAlert } from "@/contracts/road-alerts";
import { projectOnMeasuredLine } from "@/domain/geo/measure";

/** SUTRAN places PE-22 alerts on the road axis (0–4 m offsets observed on 2026-10-17); 2 km rejects misplaced points. */
export const MAX_CORRIDOR_OFFSET_KM = 2;
/** Half-length of the highlighted stretch around an interrupted or restricted alert. */
export const AFFECTED_STRETCH_HALF_KM = 1.2;

export interface CorridorAlert {
  alert: RoadAlert;
  km: number; // measured km along the MTC geometry (may differ from SUTRAN's stated km)
  offsetKm: number;
}

/** PE-22 alerts placed on the measured corridor by their coordinates, ordered by km. */
export function placeAlertsOnCorridor(alerts: readonly RoadAlert[], corridor: CorridorData): CorridorAlert[] {
  return alerts
    .filter((alert) => alert.roadCode === corridor.road)
    .map((alert) => {
      const projection = projectOnMeasuredLine([alert.lng, alert.lat], corridor.line);
      return { alert, km: projection.km, offsetKm: projection.distanceKm };
    })
    .filter((placed) => placed.offsetKm <= MAX_CORRIDOR_OFFSET_KM)
    .sort((a, b) => a.km - b.km);
}

export function elevationAtKm(profile: CorridorData["profile"], km: number): number {
  let best = profile[0];
  for (const point of profile) if (Math.abs(point.km - km) < Math.abs(best.km - km)) best = point;
  return best.elevationM;
}

export function nearestPlace(places: readonly CorridorPlace[], km: number): { place: CorridorPlace; deltaKm: number } | null {
  if (!places.length) return null;
  let best = places[0];
  for (const place of places) if (Math.abs(place.km - km) < Math.abs(best.km - km)) best = place;
  return { place: best, deltaKm: km - best.km };
}
