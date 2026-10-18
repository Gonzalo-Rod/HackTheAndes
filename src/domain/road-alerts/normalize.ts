import type { AlertCause, AlertEvidence, AlertHistoryEntry, RoadAlert, RoadStatus } from "@/contracts/road-alerts";
import { ALERT_CAUSES, ROAD_STATUSES } from "@/contracts/road-alerts";

import { parseKm, parseSutranDate, regionKey, regionLabel, safeHttpUrl, titleCase, toSentenceCase } from "./parsing";

// Maps SUTRAN records (already shape-validated by the integration adapter) to our
// RoadAlert contract. Field names below are SUTRAN's own.

export interface SutranAlertRecord {
  id: string;
  codigo?: string | null;
  motivo?: string | null;
  estadoVia?: string | null;
  titulo?: string | null;
  descripcion?: string | null;
  situacionActual?: string | null;
  lat?: number | null;
  lng?: number | null;
  region?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  viaCodigo?: string | null;
  viaNombre?: string | null;
  km?: string | null;
  sentido?: string | null;
  accionesPnp?: string | null;
  pasajerosDetenidos?: number | null;
  mercanciasDetenidas?: number | null;
  fechaEvento?: string | null;
  vigenteDesde?: string | null;
  vigenteHasta?: string | null;
  administrador?: string | null;
  fuente?: string | null;
  fuenteWeb?: string | null;
  vencida?: boolean | null;
  aunNoVigente?: boolean | null;
  reportCount?: number | null;
  lastActionAt?: string | null;
}

export interface SutranHistoryRecord {
  fecha?: string | null;
  tipo?: string | null;
  estadoNuevo?: string | null;
}

export interface SutranEvidenceRecord {
  tipo?: string | null;
  url?: string | null;
  posterUrl?: string | null;
  nombre?: string | null;
}

// Peru lies within roughly lat −18.4…−0.03 and lng −81.4…−68.6; a margin absorbs rounding.
const PERU_LAT_RANGE = [-19, 1] as const;
const PERU_LNG_RANGE = [-82, -68] as const;

const text = (value: string | null | undefined): string => value?.trim() ?? "";
const optionalText = (value: string | null | undefined): string | null => text(value) || null;
const count = (value: number | null | undefined): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export function normalizeStatus(value: string | null | undefined): RoadStatus {
  const status = text(value).toLowerCase();
  return (ROAD_STATUSES as readonly string[]).includes(status) ? (status as RoadStatus) : "desconocido";
}

export function normalizeCause(value: string | null | undefined): AlertCause {
  const cause = text(value).toLowerCase();
  return (ALERT_CAUSES as readonly string[]).includes(cause) ? (cause as AlertCause) : "otro";
}

function isoDateTimeOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function isInPeru(lat: number, lng: number): boolean {
  return lat >= PERU_LAT_RANGE[0] && lat <= PERU_LAT_RANGE[1] && lng >= PERU_LNG_RANGE[0] && lng <= PERU_LNG_RANGE[1];
}

/** Returns null when the record cannot be placed on the map. */
export function normalizeSutranAlert(record: SutranAlertRecord): RoadAlert | null {
  const { lat, lng } = record;
  if (!record.id.trim() || typeof lat !== "number" || typeof lng !== "number" || !isInPeru(lat, lng)) return null;

  const { km, kmEnd } = parseKm(record.km);
  return {
    id: record.id.trim(),
    code: text(record.codigo),
    cause: normalizeCause(record.motivo),
    roadStatus: normalizeStatus(record.estadoVia),
    title: toSentenceCase(text(record.titulo)),
    description: toSentenceCase(text(record.descripcion)),
    currentSituation: toSentenceCase(text(record.situacionActual)),
    lat,
    lng,
    region: regionLabel(text(record.region)),
    regionKey: regionKey(text(record.region)),
    province: titleCase(text(record.provincia)),
    district: titleCase(text(record.distrito)),
    roadCode: text(record.viaCodigo).toUpperCase(),
    roadName: titleCase(text(record.viaNombre)),
    kmText: text(record.km),
    km,
    kmEnd,
    direction: text(record.sentido),
    pnpActions: optionalText(record.accionesPnp),
    detainedPassengers: count(record.pasajerosDetenidos),
    detainedGoods: count(record.mercanciasDetenidas),
    eventDate: parseSutranDate(record.fechaEvento),
    validFrom: parseSutranDate(record.vigenteDesde),
    validUntil: parseSutranDate(record.vigenteHasta),
    administrator: text(record.administrador),
    source: text(record.fuente),
    sourceUrl: safeHttpUrl(record.fuenteWeb),
    reportCount: count(record.reportCount),
    lastActionAt: isoDateTimeOrNull(record.lastActionAt),
  };
}

/** Keeps alerts in force (not expired, already valid) that can be placed; newest action first. */
export function normalizeSutranAlerts(records: SutranAlertRecord[]): { alerts: RoadAlert[]; skippedCount: number } {
  const alerts: RoadAlert[] = [];
  for (const record of records) {
    if (record.vencida === true || record.aunNoVigente === true) continue;
    const alert = normalizeSutranAlert(record);
    if (alert) alerts.push(alert);
  }
  alerts.sort((a, b) => (b.lastActionAt ?? "").localeCompare(a.lastActionAt ?? ""));
  return { alerts, skippedCount: records.length - alerts.length };
}

export function normalizeSutranHistory(records: SutranHistoryRecord[]): AlertHistoryEntry[] {
  return records
    .map((record) => ({
      date: isoDateTimeOrNull(record.fecha),
      type: text(record.tipo) || "evento",
      newStatus: record.estadoNuevo ? normalizeStatus(record.estadoNuevo) : null,
    }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export function normalizeSutranEvidence(records: SutranEvidenceRecord[]): AlertEvidence[] {
  return records
    .map((record) => ({
      kind: record.tipo === "foto" ? ("foto" as const) : ("video" as const),
      url: safeHttpUrl(record.url),
      posterUrl: safeHttpUrl(record.posterUrl),
      name: optionalText(record.nombre),
    }))
    .filter((evidence) => evidence.url !== null || evidence.posterUrl !== null);
}

/**
 * Whether an alert is in force on a Lima calendar day (YYYY-MM-DD). SUTRAN validity dates are
 * whole days, so an alert stays in force through its `validUntil` day. Used for snapshots,
 * whose `vencida` flags were computed when they were captured.
 */
export function isInForceOn(alert: Pick<RoadAlert, "validFrom" | "validUntil">, limaDate: string): boolean {
  return (alert.validFrom === null || alert.validFrom <= limaDate) && (alert.validUntil === null || alert.validUntil >= limaDate);
}

export function latestActionAt(alerts: RoadAlert[]): string | null {
  return alerts.reduce<string | null>(
    (latest, alert) => (alert.lastActionAt && (!latest || alert.lastActionAt > latest) ? alert.lastActionAt : latest),
    null,
  );
}
