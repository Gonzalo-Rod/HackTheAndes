import type { SubscriptionRange } from "@/contracts/notifications";
import { passPrice } from "./alert-pass";
export function subscriptionProposal(code: string, isTest: boolean, paymentTest = false) {
  return `${paymentTest ? "PRUEBA DE PAGO REAL · " : isTest ? "DEMO · " : ""}Pase de alertas por 7 días desde esta solicitud, pago único ${passPrice()} por Qatom, sin renovación automática. Escribe ACTIVAR ${code} para aceptar y pedir el enlace de pago. Al verificar el cobro tendrás acceso; después escribe RUTA para elegir carretera, origen y destino, sin otro pago. Comprar el pase no activa alertas. BAJA cancela las notificaciones. Solo números de prueba configurados pueden usar DEMO sin pagar.`;
}
export function routeProposal(range: SubscriptionRange, code: string) {
  return `Ruta: ${range.label}. Km aprox. del mapa ${range.startKm.toFixed(1)}–${range.endKm.toFixed(1)} (no oficiales). Escribe RUTA ACTIVAR ${code} para recibir novedades solo de este tramo con tu pase vigente, sin otro pago ni cambio de vencimiento. RUTA CANCELAR descarta la propuesta. Cambiar la ruta requiere autorizar SEMANAL de nuevo.`;
}
export const ROUTE_ORIGIN_PROMPT =
  "¿Dónde empieza tu ruta por PE-22? Comparte un pin de WhatsApp sobre la vía, un lugar del catálogo o KM seguido de la distancia aproximada del mapa (no del hito oficial). Después te pediré el destino. No seguimos tu ubicación en vivo. CANCELAR descarta esta propuesta; STOP cancela las alertas.";
export function routeDestinationPrompt(label: string, road?: RoutePromptRoad) {
  if (!road || road.pilot)
    return `Origen: ${label}. Ahora comparte el pin del destino sobre PE-22, un lugar del catálogo o KM del mapa. Solo cubrimos el eje PE-22 disponible, sin rutas alternativas. Aún no se activaron nuevas alertas. CANCELAR descarta esta propuesta.`;
  return `Origen: ${label} en ${road.roadCode}. Ahora envía el destino sobre ${road.roadCode}: KM del mapa (aprox. ${road.startKm.toFixed(0)}–${road.endKm.toFixed(0)}) o un pin a menos de 500 m de la vía. Solo cubrimos esta carretera, sin rutas alternativas. Aún no se activaron nuevas alertas. CANCELAR descarta esta propuesta.`;
}

export interface RoutePromptRoad {
  roadCode: string;
  pilot: boolean;
  startKm: number;
  endKm: number;
}

/** First step of RUTA when the road is not yet known. */
export function routeRoadPrompt(roadCodes: readonly string[]) {
  return `¿Por qué carretera viajas? Escribe su código, por ejemplo PE-22. Carreteras disponibles: ${roadCodes.join(", ")}. También puedes compartir un pin de WhatsApp sobre la vía y la detectamos. CANCELAR descarta esta propuesta.`;
}

export function routeOriginPrompt(road: RoutePromptRoad) {
  if (road.pilot) return ROUTE_ORIGIN_PROMPT;
  return `Carretera ${road.roadCode}. ¿Dónde empieza tu ruta? Envía KM seguido de la distancia aproximada del mapa (aprox. ${road.startKm.toFixed(0)}–${road.endKm.toFixed(0)}, no del hito oficial) o un pin de WhatsApp sobre la vía. Después te pediré el destino. No seguimos tu ubicación en vivo. CANCELAR descarta esta propuesta; STOP cancela las alertas.`;
}

/** Ranges off the pilot name their road, so alerts and PDFs say which road they follow. */
export function routeRangeLabel(roadCode: string, pilot: boolean, label: string) {
  return pilot ? label : `${roadCode}: ${label}`;
}
