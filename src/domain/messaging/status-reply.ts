import type { AlertsResponse, RoadAlert, RoadStatus } from "@/contracts/road-alerts";
import { dashboardLink, sameRoadCode } from "./dashboard-links";

// ESTADO replies from the same live national SUTRAN feed the dashboard shows.

/** WhatsApp messages stay readable on a phone; the dashboard link carries the rest. */
const MAX_LISTED_ALERTS = 5;
const MAX_LISTED_ROADS = 4;
const MAX_TITLE_CHARS = 90;

const STATUS_RANK: Record<RoadStatus, number> = { interrumpido: 0, restringido: 1, desconocido: 2, normal: 3 };
const STATUS_LABEL: Record<RoadStatus, string> = {
  interrumpido: "INTERRUMPIDO",
  restringido: "Restringido",
  desconocido: "Estado desconocido",
  normal: "Tránsito normal",
};
const ABSENCE_NOTE =
  "La ausencia de alertas no confirma vía libre. Exposición estimada y reportes no confirmados son información separada.";

function limaTime(timestamp: string): string {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));
}

/** Most severe first, then the most recently updated. */
function bySeverity(a: RoadAlert, b: RoadAlert): number {
  return STATUS_RANK[a.roadStatus] - STATUS_RANK[b.roadStatus] || (b.lastActionAt ?? "").localeCompare(a.lastActionAt ?? "");
}

function alertLine(alert: RoadAlert, withRoad: boolean): string {
  const place = [
    withRoad ? alert.roadCode : null,
    alert.kmText.trim() ? `km ${alert.kmText.replace(/^\s*km\s*/i, "").slice(0, 30)}` : null,
    alert.region || null,
  ]
    .filter(Boolean)
    .join(", ");
  return `• ${STATUS_LABEL[alert.roadStatus]}${place ? ` (${place})` : ""}: ${alert.title.slice(0, MAX_TITLE_CHARS)}`;
}

function heading(meta: AlertsResponse["meta"]): string {
  return meta.stale
    ? `SUTRAN · datos guardados del ${limaTime(meta.fetchedAt)} (Lima); la fuente no respondió y pueden haber cambiado.`
    : `SUTRAN · consulta del ${limaTime(meta.fetchedAt)} (Lima).`;
}

function statusCounts(alerts: readonly RoadAlert[]): string {
  const interrupted = alerts.filter((alert) => alert.roadStatus === "interrumpido").length;
  const restricted = alerts.filter((alert) => alert.roadStatus === "restringido").length;
  return `${interrupted} interrumpida${interrupted === 1 ? "" : "s"} y ${restricted} restringida${restricted === 1 ? "" : "s"}`;
}

export function formatNationalStatus(response: AlertsResponse, publicUrl: string): string {
  const alerts = [...response.alerts].sort(bySeverity);
  if (!alerts.length)
    return `${heading(response.meta)}\nSin alertas vigentes en el país en esta consulta.\n${ABSENCE_NOTE}\n${dashboardLink(publicUrl)}`;
  const perRoad = new Map<string, number>();
  for (const alert of alerts) if (alert.roadCode) perRoad.set(alert.roadCode, (perRoad.get(alert.roadCode) ?? 0) + 1);
  const busiest = [...perRoad.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_LISTED_ROADS)
    .map(([road, count]) => `${road} (${count})`)
    .join(", ");
  return [
    heading(response.meta),
    `${alerts.length} alertas vigentes en el Perú: ${statusCounts(alerts)}.`,
    ...alerts.slice(0, MAX_LISTED_ALERTS).map((alert) => alertLine(alert, true)),
    busiest ? `Carreteras con más alertas: ${busiest}.` : null,
    "Escribe ESTADO PE-22 (u otro código) para ver una carretera.",
    ABSENCE_NOTE,
    dashboardLink(publicUrl),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function formatRoadStatus(response: AlertsResponse, roadCode: string, publicUrl: string): string {
  const alerts = response.alerts.filter((alert) => sameRoadCode(alert.roadCode, roadCode)).sort(bySeverity);
  if (!alerts.length)
    return `${heading(response.meta)}\nSin alertas vigentes de SUTRAN en ${roadCode} en esta consulta.\n${ABSENCE_NOTE}\n${dashboardLink(publicUrl, { road: roadCode })}`;
  const only = alerts.length === 1 ? alerts[0] : undefined;
  return [
    heading(response.meta),
    `${roadCode}: ${alerts.length} alerta${alerts.length === 1 ? "" : "s"} vigente${alerts.length === 1 ? "" : "s"} (${statusCounts(alerts)}).`,
    ...alerts.slice(0, MAX_LISTED_ALERTS).map((alert) => alertLine(alert, false)),
    alerts.length > MAX_LISTED_ALERTS ? `${alerts.length - MAX_LISTED_ALERTS} alertas adicionales en el mapa.` : null,
    ABSENCE_NOTE,
    only ? dashboardLink(publicUrl, { alert: only.id }) : dashboardLink(publicUrl, { road: roadCode }),
  ]
    .filter((line) => line !== null)
    .join("\n");
}
