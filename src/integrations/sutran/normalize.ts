import type {
  OfficialRoadAlert,
  OfficialAlertHistoryEntry,
  RoadStatus,
} from "../../contracts/road-alerts.ts";
import type { SutranAlert, SutranHistoryEvent } from "./schema.ts";
import { parseCalendarDate, parseKilometer } from "../../domain/road-data/parsing.ts";

const nullableText = (value: string | null | undefined): string | null => value || null;

export function normalizeRoadStatus(value: string): RoadStatus {
  const status = value.trim().toLowerCase();
  return status === "interrumpido" || status === "restringido" || status === "normal"
    ? status
    : "unknown";
}

export function normalizeAlert(alert: SutranAlert, retrievedAt: string): OfficialRoadAlert {
  return {
    source: "sutran",
    externalId: alert.id,
    externalCode: alert.codigo,
    roadCode: alert.viaCodigo.toUpperCase(),
    roadStatus: normalizeRoadStatus(alert.estadoVia),
    sourceRoadStatus: alert.estadoVia,
    cause: alert.motivo,
    title: alert.titulo,
    description: nullableText(alert.descripcion),
    currentSituation: nullableText(alert.situacionActual),
    location:
      alert.lat !== null && alert.lng !== null
        ? { latitude: alert.lat, longitude: alert.lng }
        : null,
    kilometerLabel: nullableText(alert.km),
    kilometer: parseKilometer(nullableText(alert.km)),
    direction: nullableText(alert.sentido),
    sourceEntity: nullableText(alert.fuente),
    eventDate: alert.fechaEvento === null ? null : parseCalendarDate(alert.fechaEvento),
    validFrom: alert.vigenteDesde === null ? null : parseCalendarDate(alert.vigenteDesde),
    validUntil: alert.vigenteHasta === null ? null : parseCalendarDate(alert.vigenteHasta),
    sourceUpdatedAt:
      alert.lastActionAt === null ? null : new Date(alert.lastActionAt).toISOString(),
    retrievedAt,
    expired: alert.vencida,
    notYetValid: alert.aunNoVigente,
  };
}

export function normalizeHistoryEntry(
  event: SutranHistoryEvent,
  externalId: string,
): OfficialAlertHistoryEntry {
  return {
    source: "sutran",
    externalId,
    occurredAt: new Date(event.fecha).toISOString(),
    eventType: event.tipo,
    roadStatus: event.estadoNuevo === null ? null : normalizeRoadStatus(event.estadoNuevo),
    sourceRoadStatus: event.estadoNuevo,
  };
}
