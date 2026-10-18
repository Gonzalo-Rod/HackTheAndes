import type { RoadAlert } from "@/contracts/road-alerts";
import type { NationalRoadEvent } from "@/contracts/road-history";
import { haversineKm } from "@/domain/geo/measure";

/**
 * Provías and SUTRAN coordinates are both approximate and slope failures recur along the same
 * stretch, so 5 km groups past emergencies around an alert without spanning a whole road section.
 */
export const NEARBY_HISTORY_RADIUS_KM = 5;
/** The detail panel lists only the closest records; the counts cover every match. */
export const MAX_LISTED_HISTORY_EVENTS = 5;

export interface NearbyHistoryEvent {
  event: NationalRoadEvent;
  distanceKm: number;
}

export interface AlertRoadHistory {
  roadCode: string;
  /** Every captured emergency on the same road code, anywhere along it. */
  sameRoadCount: number;
  nearbyCount: number;
  nearbyInterruptedCount: number;
  nearbyRainfallCount: number;
  /** Closest first, then most recent. */
  closest: NearbyHistoryEvent[];
}

export const normalizeRoadCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

/** Past emergencies on the alert's road near its position; null when the alert has no road code. */
export function historyForAlert(
  events: readonly NationalRoadEvent[],
  alert: Pick<RoadAlert, "roadCode" | "lat" | "lng">,
  radiusKm = NEARBY_HISTORY_RADIUS_KM,
): AlertRoadHistory | null {
  const roadCode = normalizeRoadCode(alert.roadCode);
  if (!roadCode) return null;
  const sameRoad = events.filter((event) => event.roadCode === roadCode);
  const nearby: NearbyHistoryEvent[] = [];
  for (const event of sameRoad) {
    if (!event.position) continue;
    const distanceKm = haversineKm([alert.lng, alert.lat], event.position);
    if (distanceKm <= radiusKm) nearby.push({ event, distanceKm });
  }
  nearby.sort((a, b) => a.distanceKm - b.distanceKm || b.event.date.localeCompare(a.event.date));
  return {
    roadCode,
    sameRoadCount: sameRoad.length,
    nearbyCount: nearby.length,
    nearbyInterruptedCount: nearby.filter(({ event }) => event.initialStatus === "interrumpido").length,
    nearbyRainfallCount: nearby.filter(({ event }) => event.rainfallReported).length,
    closest: nearby.slice(0, MAX_LISTED_HISTORY_EVENTS),
  };
}

/** Events shown on the map for the current scope; events without a position cannot be drawn. */
export function mappableHistoryEvents(events: readonly NationalRoadEvent[], roadCode: string | null): NationalRoadEvent[] {
  const road = roadCode ? normalizeRoadCode(roadCode) : null;
  return events.filter((event) => event.position !== null && (road === null || event.roadCode === road));
}
