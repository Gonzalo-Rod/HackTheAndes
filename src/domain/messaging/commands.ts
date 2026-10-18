import type { MessageIntent } from "@/contracts/messaging";

export const HELP_REPLY =
  "PeruRoad Climate: consulta ESTADO para ver alertas SUTRAN de PE-22, o EXPOSICION para la exposición climática estimada a 24 h. Puedes escribir EXPOSICION seguido de un lugar o compartir un pin de WhatsApp. Este canal atiende consultas; aún no publica reportes ni activa suscripciones.";
export function parseCommand(text: string): MessageIntent | null {
  const normalized = text
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (["ESTADO", "STATUS"].includes(normalized)) return { kind: "status", place: null };
  if (["BAJA", "STOP"].includes(normalized)) return { kind: "unsubscribe", place: null };
  if (["AVISAME", "SUSCRIBIR"].includes(normalized)) return { kind: "subscribe", place: null };
  if (["AYUDA", "HELP", "HOLA", "INICIO"].includes(normalized)) return { kind: "help", place: null };
  if (/^(EXPOSICION|CLIMA)(\s|$)/.test(normalized)) {
    const place = text
      .trim()
      .replace(/^\S+\s*/, "")
      .trim();
    return { kind: "exposure", place: place || null };
  }
  return null;
}
/** No contact identifiers accompany the text, and obvious contact details are removed. */
export function redactContactDetails(text: string): string {
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contact]").replace(/(?<!\d)\+?\d[\d ().-]{7,}\d(?!\d)/g, "[contact]");
}
