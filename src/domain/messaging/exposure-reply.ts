import type { ExposureLayer } from "@/contracts/exposure";
import { dashboardLink } from "./dashboard-links";

const CATEGORY_LABELS = {
  routine: "sin señal elevada bajo estas reglas",
  watch: "vigilancia",
  priority: "atención prioritaria",
  high_attention: "atención alta",
};
/** The overview lists at most this many roads so the reply fits one phone screen. */
const MAX_OVERVIEW_ROADS = 6;
const FOOTER =
  "Criterios experimentales, no probabilidad de huaico ni confirmación de cierre o vía segura. Lluvia de modelo (~25 km) y susceptibilidad INGEMMET; enlaces a cuencas de baja confianza.";

export interface ReplyRoad {
  roadCode: string;
  name: string;
}

/** Replies without a road keep the pilot wording older clients and alerts rely on. */
export const PILOT: ReplyRoad = { roadCode: "PE-22", name: "Carretera Central" };

function limaTime(timestamp: string): string {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));
}

function isUsable(view: ExposureLayer): boolean {
  return view.meta.state === "ready" && view.meta.operationallyUsable;
}

export function formatExposureReply(view: ExposureLayer, publicUrl: string, segmentId?: string, road: ReplyRoad = PILOT): string {
  const ageMinutes = Math.ceil(view.meta.ageSeconds / 60);
  const header = `Exposición climática estimada ${road.roadCode} (24 h). Datos: ${limaTime(view.data.sources.weatherCapturedAt)} (Lima), hace ${ageMinutes} min.`;
  const footer = `${FOOTER} Mapa: ${dashboardLink(publicUrl, { view: "pronostico", road: road.roadCode })}`;
  if (!isUsable(view)) return `${header}\nEvaluación no disponible o desactualizada. No se puede inferir riesgo bajo.\n${footer}`;
  if (segmentId) {
    const segment = view.data.segments.find((item) => item.segmentId === segmentId);
    const window = segment?.windows.next24h;
    if (!segment || !window || window.state !== "assessed" || window.category === null || !window.forecastRain.ok)
      return `${header}\nTu tramo: sin evaluación utilizable; cobertura insuficiente. No implica riesgo bajo.\n${footer}`;
    const catchments = view.data.catchments.filter((item) => segment.catchmentIds.includes(item.catchmentId));
    const susceptibility = Math.round(Math.max(...catchments.map((item) => item.highSusceptibilityFraction)) * 100);
    return `${header}\nUbicación aproximada: km ${segment.distanceFromOriginStartKm.toFixed(0)}-${segment.distanceFromOriginEndKm.toFixed(0)} del mapa de ${road.roadCode} (no son hitos oficiales). Confirma que corresponde a tu recorrido.\nAtención estimada: ${CATEGORY_LABELS[window.category]}. Lluvia: hasta ${window.forecastRain.precipitationMm.toFixed(1)} mm (máximo entre cuencas enlazadas), ${limaTime(window.validFrom)} a ${limaTime(window.validUntil)} (Lima). Hasta ${susceptibility}% de superficie con susceptibilidad alta/muy alta en una cuenca enlazada.\n${footer}`;
  }
  const assessed = view.data.segments.filter((item) => item.windows.next24h.category !== null);
  const counts = Object.entries(CATEGORY_LABELS)
    .map(([category, label]) => `${label}: ${assessed.filter((item) => item.windows.next24h.category === category).length}`)
    .join("; ");
  return `${header}\n${assessed.length}/${view.data.segments.length} tramos evaluados; ${view.data.segments.length - assessed.length} sin evaluación. ${counts}. Comparte un pin para consultar tu tramo.\n${footer}`;
}

export interface OverviewEntry {
  road: ReplyRoad;
  /** Null when the assessment could not be read; it is listed as unavailable, never as low risk. */
  view: ExposureLayer | null;
}

interface RoadSummary {
  road: ReplyRoad;
  elevatedKm: number;
  watchKm: number;
  assessedKm: number;
  totalKm: number;
}

function summarize(road: ReplyRoad, view: ExposureLayer): RoadSummary {
  const lengthKm = (segment: ExposureLayer["data"]["segments"][number]) =>
    segment.distanceFromOriginEndKm - segment.distanceFromOriginStartKm;
  const sumKm = (categories: readonly string[]) =>
    view.data.segments
      .filter((segment) => categories.includes(segment.windows.next24h.category ?? "unknown"))
      .reduce((sum, segment) => sum + lengthKm(segment), 0);
  return {
    road,
    elevatedKm: sumKm(["priority", "high_attention"]),
    watchKm: sumKm(["watch"]),
    assessedKm: sumKm(["routine", "watch", "priority", "high_attention"]),
    totalKm: view.data.segments.reduce((sum, segment) => sum + lengthKm(segment), 0),
  };
}

/** EXPOSICION without a place: every registered road, the most exposed first. */
export function formatExposureOverview(entries: readonly OverviewEntry[], publicUrl: string): string {
  const usable: RoadSummary[] = [];
  const unavailable: string[] = [];
  for (const { road, view } of entries) {
    if (view && isUsable(view)) usable.push(summarize(road, view));
    else unavailable.push(road.roadCode);
  }
  usable.sort((a, b) => b.elevatedKm - a.elevatedKm || b.watchKm - a.watchKm || a.road.roadCode.localeCompare(b.road.roadCode));
  const listed = usable.slice(0, MAX_OVERVIEW_ROADS);
  const lines = listed.map(
    (item) =>
      `• ${item.road.roadCode}: ${item.elevatedKm.toFixed(0)} km con atención alta/prioritaria, ${item.watchKm.toFixed(0)} km en vigilancia (${item.assessedKm.toFixed(0)} de ${item.totalKm.toFixed(0)} km evaluados).`,
  );
  const rest = usable.length - listed.length;
  return [
    `Exposición climática estimada, próximas 24 h, en ${entries.length} carreteras con estimación.`,
    ...(lines.length ? lines : ["Ninguna carretera tiene una evaluación vigente ahora."]),
    rest > 0 ? `${rest} carreteras más con menos km en atención; ver el mapa.` : null,
    unavailable.length ? `Sin evaluación vigente: ${unavailable.join(", ")}. No implica riesgo bajo.` : null,
    "Escribe EXPOSICION PE-32 (u otro código) o comparte un pin para tu tramo.",
    `${FOOTER} Mapa: ${dashboardLink(publicUrl, { view: "pronostico" })}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}
