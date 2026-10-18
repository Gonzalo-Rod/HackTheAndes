import type { IncidentType, PrioritizedIncident, RoadStatus } from "./prioritize";

// What the transport monitor hears when route watch calls. The script keeps the evidence level
// explicit (official, unconfirmed community report or demonstration). For a truck trip it states
// that the truck position is an estimate, because GPS is not integrated; a route watch has no truck.

const TYPE_LABELS: Record<IncidentType, string> = {
  huaico: "un huaico",
  derrumbe: "un derrumbe",
  inundación: "una inundación",
  bloqueo: "un bloqueo",
  accidente: "un accidente",
  obra: "obras en la vía",
  otro: "un incidente",
};
const STATUS_LABELS: Record<RoadStatus, string> = {
  interrumpido: "La vía figura interrumpida.",
  restringido: "El paso figura restringido.",
  unknown: "El estado de la vía no está informado.",
  normal: "La fuente informa tránsito normal.",
};

function ageText(ageMs: number): string {
  const minutes = Math.max(1, Math.round(ageMs / 60_000));
  if (minutes < 60) return `hace ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  const hours = Math.round(minutes / 60);
  return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
}

function evidenceText(item: PrioritizedIncident): string {
  if (item.incident.isTest) return "en un reporte simulado de prueba";
  return item.incident.source === "official" ? "según SUTRAN" : "en un reporte de la comunidad aún no confirmado";
}

function placementText(item: PrioritizedIncident): string {
  if (item.placement === "on_route") return "dentro del tramo que vigilas";
  if (item.placement === "near_route")
    return `a unos ${Math.max(1, Math.round(item.distanceAheadKm))} kilómetros de un extremo del tramo que vigilas`;
  if (item.placement === "beyond_destination")
    return `a unos ${Math.round(item.distanceAheadKm)} kilómetros, poco después del destino de la ruta`;
  if (item.distanceAheadKm < 1) return "en el tramo donde estimamos que está el camión";
  return `a unos ${Math.round(item.distanceAheadKm)} kilómetros por delante del camión, unos ${item.etaMinutes} minutos de viaje`;
}

function followUpPlacement(item: PrioritizedIncident): string {
  switch (item.placement) {
    case "ahead":
      return `Distancia estimada desde el camión: ${item.distanceAheadKm.toFixed(1)} km (~${item.etaMinutes} min).`;
    case "beyond_destination":
      return `Fuera del tramo, ${item.distanceAheadKm.toFixed(1)} km después del destino.`;
    case "on_route":
      return "Dentro del tramo vigilado.";
    case "near_route":
      return `Fuera del tramo vigilado, a ${item.distanceAheadKm.toFixed(1)} km de un extremo.`;
  }
}

export function composeRouteWatchCall(
  item: PrioritizedIncident,
  context: { routeLabel: string; location: string; nowMs: number },
): { spokenText: string; followUpText: string } {
  const age = ageText(context.nowMs - Date.parse(item.incident.observedAt));
  const what = `${TYPE_LABELS[item.incident.type]} ${evidenceText(item)}`;
  const spokenText = [
    item.incident.isTest ? "Esto es una prueba." : null,
    `Hola, te llama PeruRoad Clima. Alerta para tu ruta ${context.routeLabel}.`,
    `Se reportó ${what}, ${placementText(item)}, ${context.location}.`,
    STATUS_LABELS[item.incident.roadStatus],
    `Último reporte ${age}.`,
    item.etaMinutes === null
      ? "Te enviamos el detalle por WhatsApp."
      : "La posición del camión es estimada por la hora de salida y la velocidad promedio. Te enviamos el detalle por WhatsApp.",
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
  const followUpText = [
    `${item.incident.isTest ? "PRUEBA · " : ""}PeruRoad Clima · vigilancia de ruta ${context.routeLabel}`,
    `${TYPE_LABELS[item.incident.type]} ${evidenceText(item)}, ${context.location}.`,
    `${STATUS_LABELS[item.incident.roadStatus]} Último reporte ${age}.`,
    followUpPlacement(item),
    item.etaMinutes === null
      ? "Una alerta no confirma que el resto de la ruta esté libre."
      : "Posición estimada sin GPS. Una alerta no confirma que el resto de la ruta esté libre.",
  ].join("\n");
  return { spokenText, followUpText };
}
