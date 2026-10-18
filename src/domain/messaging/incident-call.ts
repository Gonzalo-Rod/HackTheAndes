import type { RoadContextResponse } from "@peruroad/road-data/context/contracts";

type StoredOfficialAlert = Extract<RoadContextResponse, { kind: "official_alerts" }>["alerts"][number];

// Spoken incident notice for a one-way call. It only relays an official SUTRAN record; it never
// states that other stretches are clear, and stale data is announced as possibly outdated.

export interface OfficialAlertsSnapshot {
  state: "ready" | "stale" | "unavailable";
  /** Completion time of the SUTRAN poll, ISO 8601 UTC. */
  asOf: string | null;
  alerts: readonly StoredOfficialAlert[];
}

export interface IncidentCall {
  externalId: string;
  /** Text read aloud by speech synthesis: no URLs or abbreviations. */
  spokenText: string;
  /** WhatsApp follow-up with the same facts, so the driver can read it later. */
  followUpText: string;
}

export type IncidentCallFailure = "source_unavailable" | "no_active_incident";

/** Closures first: they are the conditions a driver most needs to hear about. */
const STATUS_PRIORITY = { interrumpido: 0, restringido: 1, unknown: 2, normal: 3 } as const;
const SPOKEN_STATUS = {
  interrumpido: "Tránsito interrumpido",
  restringido: "Tránsito restringido",
  unknown: "Estado de la vía no informado",
  normal: "Tránsito normal según la fuente",
} as const;
/** Bounds each free-text SUTRAN field so the call stays short. */
const MAX_SPOKEN_FIELD_LENGTH = 160;

function limaTime(timestamp: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_SPOKEN_FIELD_LENGTH);
}

/** Reads "Km. 74+200" style labels as words so synthesis does not spell the abbreviation. */
function spokenKilometer(label: string): string {
  return clean(label)
    .replace(/\bkm\.?\s*/gi, "kilómetro ")
    .replace(/\+/g, " más ");
}

export function selectIncidentForCall(alerts: readonly StoredOfficialAlert[]): StoredOfficialAlert | null {
  const current = alerts.filter((item) => !item.alert.expired && !item.alert.notYetValid);
  const sorted = [...current].sort(
    (a, b) => STATUS_PRIORITY[a.alert.roadStatus] - STATUS_PRIORITY[b.alert.roadStatus] || b.lastObservedAt.localeCompare(a.lastObservedAt),
  );
  return sorted[0] ?? null;
}

export function composeIncidentCall(
  snapshot: OfficialAlertsSnapshot,
): { ok: true; value: IncidentCall } | { ok: false; error: IncidentCallFailure } {
  if (snapshot.state === "unavailable" || snapshot.asOf === null) return { ok: false, error: "source_unavailable" };
  const selected = selectIncidentForCall(snapshot.alerts);
  if (!selected) return { ok: false, error: "no_active_incident" };

  const { alert } = selected;
  const freshness =
    snapshot.state === "stale"
      ? `Son datos guardados de SUTRAN del ${limaTime(snapshot.asOf)}, y pueden haber cambiado.`
      : `Información de SUTRAN consultada el ${limaTime(snapshot.asOf)}, hora de Lima.`;
  const facts = [
    `${clean(alert.title)}.`,
    `${SPOKEN_STATUS[alert.roadStatus]}.`,
    alert.kilometerLabel ? `Ubicación: ${spokenKilometer(alert.kilometerLabel)}.` : null,
    alert.currentSituation ? `Situación: ${clean(alert.currentSituation)}.` : null,
  ].filter((part): part is string => part !== null);

  const spokenText = [
    "Hola, te llama PeruRoad Clima con una alerta oficial en la Carretera Central.",
    ...facts,
    freshness,
    "Esta alerta no confirma que otros tramos estén libres. Te enviamos el detalle por WhatsApp.",
  ].join(" ");
  const followUpText = [
    "PeruRoad Clima · alerta oficial SUTRAN (PE-22)",
    `${clean(alert.title)}: ${alert.roadStatus === "unknown" ? "estado desconocido" : alert.roadStatus}${alert.kilometerLabel ? ` (${clean(alert.kilometerLabel)})` : ""}.`,
    alert.currentSituation ? `Situación: ${clean(alert.currentSituation)}.` : null,
    freshness,
    "La ausencia de otras alertas no confirma vía libre.",
  ]
    .filter((part): part is string => part !== null)
    .join("\n");

  return { ok: true, value: { externalId: alert.externalId, spokenText, followUpText } };
}
