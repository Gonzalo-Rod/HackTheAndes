import { parseRoadCode } from "./dashboard-links";

// Opt-in saved road: a driver types one road code so bare ESTADO / EXPOSICION answer for it.
// Only the road code is remembered; alerts, passes and route subscriptions never read it.

export type SavedRoadCommand =
  | { kind: "save"; roadCode: string }
  | { kind: "save_invalid" }
  | { kind: "show" }
  | { kind: "forget" }
  /** ESTADO PERU / EXPOSICION PERU: the nationwide answer even when a road is saved. */
  | { kind: "national"; query: "status" | "exposure" };

const SAVE = /^(GUARDAR|RECORDAR) CARRETERA(?:\s+(.*))?$/;
const NATIONAL = /^(ESTADO|STATUS|EXPOSICION|CLIMA) (PERU|TODO|NACIONAL)$/;

export function parseSavedRoadCommand(text: string): SavedRoadCommand | null {
  const normalized = text
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
  const save = SAVE.exec(normalized);
  if (save) {
    const roadCode = save[2] ? parseRoadCode(save[2]) : null;
    return roadCode ? { kind: "save", roadCode } : { kind: "save_invalid" };
  }
  if (normalized === "MI CARRETERA") return { kind: "show" };
  if (["OLVIDAR CARRETERA", "BORRAR CARRETERA"].includes(normalized)) return { kind: "forget" };
  const national = NATIONAL.exec(normalized);
  if (national) return { kind: "national", query: ["ESTADO", "STATUS"].includes(national[1] ?? "") ? "status" : "exposure" };
  return null;
}

export const SAVED_ROAD_REPLIES = {
  unavailable:
    "La carretera guardada no está disponible en este servicio. No se guardó ni borró nada. Usa ESTADO PE-22 o EXPOSICION PE-32.",
  saveInvalid: "Escribe el código de la carretera, por ejemplo GUARDAR CARRETERA PE-22. No se guardó nada.",
  voice:
    "Para guardar una carretera escribe el mensaje GUARDAR CARRETERA PE-22; las notas de voz no autorizan guardar datos. No se guardó nada.",
  none: "No tienes una carretera guardada. Escribe GUARDAR CARRETERA PE-22 para que ESTADO y EXPOSICION respondan por esa vía.",
  forgotten: "Borré tu carretera guardada. ESTADO y EXPOSICION vuelven a responder para todo el Perú.",
  forgetFailed: "No pude borrar tu carretera guardada ahora; puede seguir guardada. Intenta OLVIDAR CARRETERA más tarde.",
  readFailed: "No pude consultar tu carretera guardada ahora. Intenta más tarde; no se cambió nada.",
  saveFailed: "No pude guardar la carretera ahora. No quedó guardada; intenta más tarde. ESTADO PE-22 sigue funcionando.",
} as const;

export function savedReply(roadCode: string, previous: string | null): string {
  const change = previous && previous !== roadCode ? ` Reemplaza a ${previous}.` : "";
  return `Guardé ${roadCode} como tu carretera.${change} Ahora ESTADO y EXPOSICION responden por ${roadCode}; ESTADO PERU muestra todo el país. Solo se guarda el código de la vía con un identificador derivado de tu número, no el número. OLVIDAR CARRETERA lo borra. No activa alertas ni rutas.`;
}

export function unchangedReply(roadCode: string): string {
  return `${roadCode} ya es tu carretera guardada. OLVIDAR CARRETERA la borra.`;
}

export function staleKeptReply(roadCode: string, previous: string): string {
  return `Guardé ${roadCode}, pero no pude borrar ${previous}. Usaremos ${roadCode} (la más reciente); repite GUARDAR CARRETERA ${roadCode} más tarde para limpiar la anterior.`;
}

export function showReply(roadCode: string): string {
  return `Tu carretera guardada es ${roadCode}. ESTADO y EXPOSICION responden por ella; ESTADO PERU muestra todo el país. GUARDAR CARRETERA PE-xx la cambia y OLVIDAR CARRETERA la borra.`;
}

export function recalledFooter(roadCode: string, query: "status" | "exposure"): string {
  const national = query === "status" ? "ESTADO PERU" : "EXPOSICION PERU";
  return `Respondí por tu carretera guardada ${roadCode}. ${national} muestra todo el país; OLVIDAR CARRETERA la borra.`;
}

export const RECALL_FAILED_NOTE = "No pude consultar tu carretera guardada; muestro la respuesta para todo el Perú.";
