import type { AlertCandidate } from "@/contracts/notifications";

export interface AlertLandmark {
  name: string;
  kind: "bridge" | "sos" | "toll";
  distanceKm: number;
}
/** A nearby label is approximate; do not attach a distant landmark to an assessed segment. */
const MAX_LANDMARK_DISTANCE_KM = 2;
/** Keep notifications readable on a phone; full evidence remains available through query commands. */
export const MAX_ALERT_MESSAGE_CHARACTERS = 650;
const shortText = (value: string, limit: number) => {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
};
export function alertLocation(startKm: number, endKm: number, landmarks: readonly AlertLandmark[]): string {
  const distance = (place: AlertLandmark) => Math.max(startKm - place.distanceKm, place.distanceKm - endKm, 0);
  const nearest = [...landmarks].sort((a, b) => distance(a) - distance(b) || a.name.localeCompare(b.name))[0];
  if (nearest && distance(nearest) <= MAX_LANDMARK_DISTANCE_KM) {
    const kind = { bridge: "puente", toll: "peaje", sos: "poste SOS" }[nearest.kind];
    return `cerca del ${kind} ${shortText(nearest.name.replace(/^(puente|peaje|poste\s+sos)\s+/i, ""), 45)}`;
  }
  return `tramo a ${startKm.toFixed(1)}–${endKm.toFixed(1)} km del inicio del mapa (no km oficiales)`;
}
function peruTime(timestamp: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}
export function officialAlertText(status: "normal" | "restringido" | "interrumpido" | "unknown", title: string, location: string): string {
  const condition = {
    normal: "informa tránsito normal",
    restringido: "paso restringido",
    interrumpido: "vía cerrada",
    unknown: "nuevo aviso; estado de tránsito desconocido",
  }[status];
  return `SUTRAN: ${condition}, ${location}. ${shortText(title, 65)}`;
}
export function communityAlertText(type: string, location: string, isTest: boolean): string {
  return `${isTest ? "DEMO · " : ""}Reporte SIN CONFIRMAR: ${shortText(type.replaceAll("_", " "), 35)}, ${location}.`;
}
export function formatAlertBundle(selected: AlertCandidate[], isTest: boolean): string {
  const exposure = selected.filter((c) => c.kind === "exposure");
  const lines = [`${isTest ? "DEMO · " : ""}PeruRoad · PE-22`];
  for (const candidate of selected.filter((c) => c.kind !== "exposure")) lines.push(shortText(candidate.text, 145));
  if (exposure.length) {
    const distance = (km: number) => Number(km.toFixed(1)).toString();
    const ranges = [...new Set(exposure.map((c) => `${distance(c.startKm)}–${distance(c.endKm)}`))];
    const until = exposure
      .map((c) => c.forecastUntil)
      .filter((t): t is string => t !== undefined)
      .sort()[0];
    lines.push(`Atención por lluvias · km aprox. del mapa: ${ranges.slice(0, 3).join(", ")} (no oficiales).`);
    if (ranges.length > 3) lines.push(`Y ${ranges.length - 3} tramos más de tu ruta. EXPOSICION: detalles.`);
    if (until) lines.push(`Hasta ${peruTime(until)} (hora Perú).`);
    lines.push("Lluvia prevista en zonas propensas a huaicos o derrumbes. Es una estimación, no un evento confirmado.");
  }
  lines.push("Antes de salir, consulta ESTADO. EXPOSICION: detalles. BAJA: cancelar.");
  // Bound individual lines before joining so attribution, uncertainty and opt-out are never cut off.
  return lines.join("\n");
}
