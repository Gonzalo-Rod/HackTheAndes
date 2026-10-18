import type { MessageIntent } from "@/contracts/messaging";

export const HELP_REPLY =
  "SUSCRIBIR compra un pase de 7 días desde la solicitud: USD 0,001 por Qatom, sin renovación automática. ACTIVAR acepta y prepara el pago; PAGO consulta el estado. Comprar el pase no activa alertas. " +
  "RUTA elige origen y destino por PE-22 con tu pase vigente (pines, lugares del catálogo o km del mapa); RUTA ACTIVAR confirma sin otro pago ni cambio de vencimiento. Avisamos de novedades de tu tramo, reportes SIN CONFIRMAR y posibles huaicos estimados. STOP o BAJA detiene notificaciones; conservas el tiempo restante del pase. Consulta ESTADO o EXPOSICION (24 h). REPORTE describe un incidente; revisa el pin y escribe CONFIRMAR con su código. REPORTE PRUEBA es una demostración; CANCELAR descarta el borrador. SEMANAL autoriza aparte un PDF ambiental los lunes; PDF pide el archivo y SEMANAL BAJA cancela solo los informes. También puedes enviar notas de voz; las fotos no se procesan.";
export function parseCommand(text: string): MessageIntent | null {
  const normalized = text
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (["ESTADO", "STATUS"].includes(normalized)) return { kind: "status", place: null };
  if (["BAJA", "STOP"].includes(normalized)) return { kind: "unsubscribe", place: null };
  if (["AVISAME", "SUSCRIBIR", "SUSCRIBIR 7 DIAS"].includes(normalized)) return { kind: "subscribe", place: null };
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
