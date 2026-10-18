import type { AlertCause, RoadStatus } from "@/contracts/road-alerts";

// Presentation metadata (Spanish labels and colors). Road status uses the fixed status
// scale (critical / warning / good) and always ships with an icon and a text label, so
// meaning never depends on color alone.

export const STATUS_META: Record<RoadStatus, { label: string; adjective: string; description: string; color: string; ink: string }> = {
  interrumpido: { label: "Interrumpido", adjective: "Vía interrumpida", description: "Tránsito cortado", color: "#d03b3b", ink: "#ffffff" },
  restringido: {
    label: "Restringido",
    adjective: "Vía restringida",
    description: "Paso limitado o por turnos",
    color: "#e08316",
    ink: "#ffffff",
  },
  normal: {
    label: "Transitable · Alerta activa",
    adjective: "Tránsito abierto",
    description: "Transitable; la alerta sigue vigente",
    color: "#4a5b6d",
    ink: "#ffffff",
  },
  desconocido: {
    label: "Sin dato",
    adjective: "Estado sin dato",
    description: "SUTRAN no indicó el estado",
    color: "#857d70",
    ink: "#ffffff",
  },
};

/** Display order and stacking priority (most severe first). */
export const STATUS_ORDER: RoadStatus[] = ["interrumpido", "restringido", "normal", "desconocido"];
export const STATUS_PRIORITY: Record<RoadStatus, number> = { interrumpido: 3, restringido: 2, normal: 1, desconocido: 0 };

export const CAUSE_META: Record<AlertCause, { label: string; short: string }> = {
  fenomenos_naturales: { label: "Fenómenos naturales", short: "Fenómeno natural" },
  accidentes: { label: "Accidentes", short: "Accidente" },
  infraestructura: { label: "Infraestructura y obras", short: "Infraestructura" },
  humano: { label: "Factor humano", short: "Factor humano" },
  otro: { label: "Otros", short: "Otro" },
};

export const CAUSE_ORDER: AlertCause[] = ["fenomenos_naturales", "accidentes", "infraestructura", "humano", "otro"];

const HISTORY_TYPE_LABELS: Record<string, string> = {
  publicacion: "Publicación de la alerta",
  actualizacion: "Actualización",
  cambio_estado: "Cambio de estado",
  cambio_estado_via: "Cambio de estado de la vía",
};

export function historyTypeLabel(type: string): string {
  const known = HISTORY_TYPE_LABELS[type];
  if (known) return known;
  const text = type.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const SUTRAN_MAP_URL = "https://alertasviales.sutran.gob.pe/";
export const sutranAlertUrl = (id: string) => `${SUTRAN_MAP_URL}alerta/${encodeURIComponent(id)}`;
