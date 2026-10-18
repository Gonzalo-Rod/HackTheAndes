import type { MessageIntent } from "@/contracts/messaging";

export const HELP_REPLY =
  "PeruRoad Climate: consulta ESTADO o EXPOSICION (24 h). Para reportar, escribe REPORTE seguido de lo que observas en PE-22; después confirma el lugar y el código que te indicaremos. Usa REPORTE PRUEBA para una demostración, o CANCELAR para descartar un borrador. SUSCRIBIR elige un tramo y solicita tu autorización; BAJA cancela alertas. Revisamos novedades cada 30 minutos, sin horario de silencio. SEMANAL autoriza aparte un PDF ambiental los lunes; PDF pide el archivo y SEMANAL BAJA cancela solo esos informes. También puedes enviar notas de voz; las fotos no se procesan.";
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
