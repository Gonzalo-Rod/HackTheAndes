import type { RoadAlert } from "@/contracts/road-alerts";

/** A vigente alert with no SUTRAN action for this long is flagged as possibly outdated. */
export const STALE_ALERT_AFTER_HOURS = 24;
const HOUR_MS = 3_600_000;

/** Hours since SUTRAN last acted on the alert, or null when it never recorded an action. */
export function hoursSinceAction(alert: Pick<RoadAlert, "lastActionAt">, nowMs: number): number | null {
  if (!alert.lastActionAt) return null;
  return Math.max(0, (nowMs - Date.parse(alert.lastActionAt)) / HOUR_MS);
}

/** True when the alert is still vigente but SUTRAN has not touched it for STALE_ALERT_AFTER_HOURS. */
export function isStaleAlert(alert: Pick<RoadAlert, "lastActionAt">, nowMs: number): boolean {
  const hours = hoursSinceAction(alert, nowMs);
  return hours !== null && hours > STALE_ALERT_AFTER_HOURS;
}

/** Number of alerts per road code (e.g. PE-22 → 4). */
export function countByRoad(alerts: readonly Pick<RoadAlert, "roadCode">[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { roadCode } of alerts) counts.set(roadCode, (counts.get(roadCode) ?? 0) + 1);
  return counts;
}
