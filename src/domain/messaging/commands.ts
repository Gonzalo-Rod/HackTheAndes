import type { MessageIntent } from "@/contracts/messaging";
import { parseRoadCode } from "./dashboard-links";
import { passPrice } from "@/domain/subscriptions/alert-pass";

export const HELP_REPLY =
  `SUSCRIBIR compra un pase de 7 días desde la solicitud: ${passPrice()} por Qatom, sin renovación automática. ACTIVAR acepta y prepara el pago; PAGO consulta el estado. Comprar el pase no activa alertas. ` +
  "RUTA elige la carretera con tu pase vigente (escribe su código, por ejemplo RUTA PE-32); después origen y destino sobre esa carretera con KM del mapa o pines (lugares del catálogo solo en PE-22). RUTA ACTIVAR confirma sin otro pago ni cambio de vencimiento. Avisamos de novedades de tu tramo, reportes SIN CONFIRMAR y posibles huaicos estimados. STOP o BAJA detiene notificaciones; conservas el tiempo restante del pase. Consulta gratis en todo el Perú: ESTADO resume alertas SUTRAN y ESTADO PE-22 (u otro código) muestra una carretera; EXPOSICION compara las carreteras con estimación climática (24 h), EXPOSICION PE-32 muestra una y un pin ubica tu tramo. REPORTE describe un incidente; revisa el pin y escribe CONFIRMAR con su código. REPORTE PRUEBA es una demostración; CANCELAR descarta el borrador. SEMANAL autoriza aparte un PDF ambiental los lunes (rutas en PE-22); PDF pide el archivo y SEMANAL BAJA cancela solo los informes. GUARDAR CARRETERA PE-22 (opcional) hace que ESTADO y EXPOSICION respondan por esa vía; MI CARRETERA la muestra y OLVIDAR CARRETERA la borra. También puedes enviar notas de voz; las fotos no se procesan.";
export function parseCommand(text: string): MessageIntent | null {
  const normalized = text
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (/^(ESTADO|STATUS)(\s|$)/.test(normalized)) {
    // Only a road code makes a deterministic command; other text goes to the intent parser.
    const road = argument(text);
    if (!road) return { kind: "status", place: null };
    if (parseRoadCode(road)) return { kind: "status", place: road };
  }
  if (["BAJA", "STOP"].includes(normalized)) return { kind: "unsubscribe", place: null };
  if (["AVISAME", "SUSCRIBIR", "SUSCRIBIR 7 DIAS"].includes(normalized)) return { kind: "subscribe", place: null };
  if (["AYUDA", "HELP", "HOLA", "INICIO"].includes(normalized)) return { kind: "help", place: null };
  if (/^(EXPOSICION|CLIMA)(\s|$)/.test(normalized)) return { kind: "exposure", place: argument(text) };
  return null;
}
/** Text after the command word, keeping the user's spelling for place names. */
function argument(text: string): string | null {
  return (
    text
      .trim()
      .replace(/^\S+\s*/, "")
      .trim()
      .slice(0, 200) || null
  );
}
/** No contact identifiers accompany the text, and obvious contact details are removed. */
export function redactContactDetails(text: string): string {
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contact]").replace(/(?<!\d)\+?\d[\d ().-]{7,}\d(?!\d)/g, "[contact]");
}
