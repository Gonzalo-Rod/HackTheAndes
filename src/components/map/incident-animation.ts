import type { AlertCause, RoadAlert } from "@/contracts/road-alerts";

export type IncidentAnimationKind =
  "rockslide" | "debris-flow" | "rain" | "flood" | "frost" | "vehicle" | "roadworks" | "people" | "generic";

export interface IncidentAnimation {
  kind: IncidentAnimationKind;
  label: string;
}

const TITLES: Record<IncidentAnimationKind, string> = {
  rockslide: "Deslizamiento y caída de rocas",
  "debris-flow": "Flujo de detritos",
  rain: "Lluvia en zona de montaña",
  flood: "Crecida junto a la vía",
  frost: "Helada o nevada",
  vehicle: "Incidente vehicular",
  roadworks: "Obras y control vial",
  people: "Control de tránsito",
  generic: "Riesgo en la vía",
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function classifyIncidentAnimation(
  alert: Pick<RoadAlert, "cause" | "title" | "description" | "currentSituation">,
): IncidentAnimationKind {
  const text = normalize(`${alert.title} ${alert.description} ${alert.currentSituation}`);
  if (/helada|friaje|nevada|nieve|granizo/.test(text)) return "frost";
  if (/inundacion|desborde|anegamiento|crecida/.test(text)) return "flood";
  if (/huaico|huayco|aluvion|flujo de detritos|flujo de lodo/.test(text)) return "debris-flow";
  if (/deslizamiento|derrumbe|caida de piedras|caida de rocas|desprendimiento|talud|roca/.test(text)) return "rockslide";
  if (/lluvia|precipitacion|tormenta/.test(text)) return "rain";
  if (/choque|colision|despiste|volcadura|accidente/.test(text)) return "vehicle";
  if (/manifestacion|protesta|bloqueo|huelga/.test(text)) return "people";
  if (/obra|mantenimiento|puente|alcantarilla|infraestructura|trabajos/.test(text)) return "roadworks";

  const fallback: Record<AlertCause, IncidentAnimationKind> = {
    fenomenos_naturales: "rain",
    accidentes: "vehicle",
    infraestructura: "roadworks",
    humano: "people",
    otro: "generic",
  };
  return fallback[alert.cause];
}

export function getIncidentAnimation(alert: Pick<RoadAlert, "cause" | "title" | "description" | "currentSituation">): IncidentAnimation {
  const kind = classifyIncidentAnimation(alert);
  return { kind, label: TITLES[kind] };
}
