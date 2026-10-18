import type { RoadAlert } from "@/contracts/road-alerts";
import { DAY_MS, limaDateToUtcMs, startOfLimaDayMs } from "@/lib/time";

// The timeline replays alerts that are in force today by their event date (fechaEvento).
// SUTRAN publishes only current alerts, so this is not a history of past incidents.

export type TimelineRange = "7d" | "30d" | "todo";

export const RANGE_DAYS: Record<Exclude<TimelineRange, "todo">, number> = { "7d": 7, "30d": 30 };
/** SUTRAN event dates have no time of day; events are placed at 12:00 Lima time. */
export const EVENT_HOUR_LIMA = 12;

export function eventTimeMs(alert: RoadAlert): number | null {
  return alert.eventDate ? limaDateToUtcMs(alert.eventDate, EVENT_HOUR_LIMA) : null;
}

export interface TimelineWindow {
  startMs: number;
  endMs: number;
}

/** Window ending now: the last 7 or 30 Lima calendar days, or back to the earliest event. */
export function timelineWindow(alerts: readonly RoadAlert[], range: TimelineRange, nowMs: number): TimelineWindow {
  const todayStart = startOfLimaDayMs(nowMs);
  if (range !== "todo") return { startMs: todayStart - (RANGE_DAYS[range] - 1) * DAY_MS, endMs: nowMs };
  const times = alerts.map(eventTimeMs).filter((t): t is number => t !== null);
  const earliest = times.length ? Math.min(...times) : nowMs;
  return { startMs: Math.min(startOfLimaDayMs(earliest), todayStart), endMs: nowMs };
}

/** Alerts whose event date is after the cursor (hidden while replaying). Undated alerts are always shown. */
export function hiddenAtCursor(alerts: readonly RoadAlert[], cursorMs: number): Set<string> {
  const hidden = new Set<string>();
  for (const alert of alerts) {
    const t = eventTimeMs(alert);
    if (t !== null && t > cursorMs) hidden.add(alert.id);
  }
  return hidden;
}

export interface CumulativePoint {
  dayStartMs: number;
  total: number; // alerts with an event date on or before this day
  added: number; // alerts whose event date is this day
}

/** Daily cumulative count of current alerts across the window, including those dated before it. */
export function cumulativeByDay(alerts: readonly RoadAlert[], window: TimelineWindow): CumulativePoint[] {
  const times = alerts.map(eventTimeMs).filter((t): t is number => t !== null);
  const points: CumulativePoint[] = [];
  for (let day = startOfLimaDayMs(window.startMs); day <= window.endMs; day += DAY_MS) {
    const dayEnd = day + DAY_MS;
    points.push({
      dayStartMs: day,
      total: times.filter((t) => t < dayEnd).length,
      added: times.filter((t) => t >= day && t < dayEnd).length,
    });
  }
  return points;
}

export function countBefore(alerts: readonly RoadAlert[], ms: number): number {
  return alerts.filter((alert) => {
    const t = eventTimeMs(alert);
    return t !== null && t < ms;
  }).length;
}

/** Next distinct event time strictly after the cursor, or null. */
export function nextEventTime(alerts: readonly RoadAlert[], cursorMs: number): number | null {
  const later = alerts.map(eventTimeMs).filter((t): t is number => t !== null && t > cursorMs);
  return later.length ? Math.min(...later) : null;
}

/** Previous distinct event time strictly before the cursor, or null. */
export function previousEventTime(alerts: readonly RoadAlert[], cursorMs: number): number | null {
  const earlier = alerts.map(eventTimeMs).filter((t): t is number => t !== null && t < cursorMs);
  return earlier.length ? Math.max(...earlier) : null;
}
