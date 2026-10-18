import type { SubscriptionRange } from "@/contracts/notifications";
import { passPrice } from "./alert-pass";
export function subscriptionProposal(code: string, isTest: boolean, paymentTest = false) {
  return `${paymentTest ? "PRUEBA DE PAGO REAL · " : isTest ? "DEMO · " : ""}Pase PE-22 por 7 días desde esta solicitud, pago único ${passPrice()} por Qatom, sin renovación automática. Escribe ACTIVAR ${code} para aceptar y pedir el enlace de pago. Al verificar el cobro tendrás acceso; después escribe RUTA para elegir origen y destino, sin otro pago. Comprar el pase no activa alertas de todo el corredor. BAJA cancela las notificaciones. Solo números de prueba configurados pueden usar DEMO sin pagar.`;
}
export function routeProposal(range: SubscriptionRange, code: string) {
  return `Ruta: ${range.label}. Km aprox. del mapa ${range.startKm.toFixed(1)}–${range.endKm.toFixed(1)} (no oficiales). Escribe RUTA ACTIVAR ${code} para recibir novedades solo de este tramo con tu pase vigente, sin otro pago ni cambio de vencimiento. RUTA CANCELAR descarta la propuesta. Cambiar la ruta requiere autorizar SEMANAL de nuevo.`;
}
export const ROUTE_ORIGIN_PROMPT =
  "¿Dónde empieza tu ruta por PE-22? Comparte un pin de WhatsApp sobre la vía, un lugar del catálogo o KM seguido de la distancia aproximada del mapa (no del hito oficial). Después te pediré el destino. No seguimos tu ubicación en vivo. CANCELAR descarta esta propuesta; STOP cancela las alertas.";
export function routeDestinationPrompt(label: string) {
  return `Origen: ${label}. Ahora comparte el pin del destino sobre PE-22, un lugar del catálogo o KM del mapa. Solo cubrimos el eje PE-22 disponible, sin rutas alternativas. Aún no se activaron nuevas alertas. CANCELAR descarta esta propuesta.`;
}
