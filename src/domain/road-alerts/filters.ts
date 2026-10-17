import type { AlertCause, RoadAlert, RoadStatus } from "@/contracts/road-alerts";
import { ALERT_CAUSES, ROAD_STATUSES } from "@/contracts/road-alerts";

import { stripAccents } from "./parsing";

export interface AlertFilters {
  statuses: readonly RoadStatus[]; // empty = all
  causes: readonly AlertCause[]; // empty = all
  regionKey: string | null;
  roadCode: string | null; // e.g. "PE-22" for the Carretera Central scope
  query: string;
}

export const EMPTY_FILTERS: AlertFilters = { statuses: [], causes: [], regionKey: null, roadCode: null, query: "" };

const STATUS_RANK: Record<RoadStatus, number> = { interrumpido: 0, restringido: 1, normal: 2, desconocido: 3 };

const fold = (value: string) => stripAccents(value).toLowerCase();

export function matchesQuery(alert: RoadAlert, query: string): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = fold(
    [
      alert.title,
      alert.code,
      alert.roadCode,
      alert.roadName,
      alert.district,
      alert.province,
      alert.region,
      alert.kmText,
      alert.source,
    ].join(" "),
  );
  return terms.every((term) => haystack.includes(term));
}

type Dimension = "statuses" | "causes";

function matches(alert: RoadAlert, filters: AlertFilters, ignore?: Dimension): boolean {
  if (ignore !== "statuses" && filters.statuses.length && !filters.statuses.includes(alert.roadStatus)) return false;
  if (ignore !== "causes" && filters.causes.length && !filters.causes.includes(alert.cause)) return false;
  if (filters.regionKey && alert.regionKey !== filters.regionKey) return false;
  if (filters.roadCode && alert.roadCode !== filters.roadCode) return false;
  return matchesQuery(alert, filters.query);
}

export function filterAlerts(alerts: readonly RoadAlert[], filters: AlertFilters): RoadAlert[] {
  return alerts.filter((alert) => matches(alert, filters));
}

/** Facet counts: each dimension is counted with every other filter applied, so chips show what selecting them yields. */
export function facetCounts(alerts: readonly RoadAlert[], filters: AlertFilters) {
  const statuses = Object.fromEntries(ROAD_STATUSES.map((s) => [s, 0])) as Record<RoadStatus, number>;
  const causes = Object.fromEntries(ALERT_CAUSES.map((c) => [c, 0])) as Record<AlertCause, number>;
  for (const alert of alerts) {
    if (matches(alert, filters, "statuses")) statuses[alert.roadStatus]++;
    if (matches(alert, filters, "causes")) causes[alert.cause]++;
  }
  return { statuses, causes };
}

export function regionOptions(alerts: readonly RoadAlert[]): { key: string; label: string; count: number }[] {
  const byKey = new Map<string, { key: string; label: string; count: number }>();
  for (const alert of alerts) {
    if (!alert.regionKey) continue;
    const entry = byKey.get(alert.regionKey) ?? { key: alert.regionKey, label: alert.region, count: 0 };
    entry.count++;
    byKey.set(alert.regionKey, entry);
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}

export function hasActiveFilters(filters: AlertFilters): boolean {
  return filters.statuses.length > 0 || filters.causes.length > 0 || filters.regionKey !== null || filters.query.trim() !== "";
}

export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export interface AlertSummary {
  total: number;
  byStatus: Record<RoadStatus, number>;
  roadCount: number;
  regionCount: number;
}

export function summarizeAlerts(alerts: readonly RoadAlert[]): AlertSummary {
  const byStatus = Object.fromEntries(ROAD_STATUSES.map((s) => [s, 0])) as Record<RoadStatus, number>;
  for (const alert of alerts) byStatus[alert.roadStatus]++;
  return {
    total: alerts.length,
    byStatus,
    roadCount: new Set(alerts.map((a) => a.roadCode).filter(Boolean)).size,
    regionCount: new Set(alerts.map((a) => a.regionKey).filter(Boolean)).size,
  };
}

/** Most recent SUTRAN action first; ties broken by severity. */
export function sortByRecentAction(alerts: readonly RoadAlert[]): RoadAlert[] {
  return [...alerts].sort(
    (a, b) => (b.lastActionAt ?? "").localeCompare(a.lastActionAt ?? "") || STATUS_RANK[a.roadStatus] - STATUS_RANK[b.roadStatus],
  );
}

/** Alert counts per cause, split by road status, for causes that have at least one alert. */
export function causeStatusMatrix(alerts: readonly RoadAlert[], causeOrder: readonly AlertCause[]) {
  return causeOrder
    .map((cause) => {
      const byStatus = Object.fromEntries(ROAD_STATUSES.map((s) => [s, 0])) as Record<RoadStatus, number>;
      for (const alert of alerts) if (alert.cause === cause) byStatus[alert.roadStatus]++;
      return { cause, byStatus, total: Object.values(byStatus).reduce((sum, n) => sum + n, 0) };
    })
    .filter((row) => row.total > 0);
}
