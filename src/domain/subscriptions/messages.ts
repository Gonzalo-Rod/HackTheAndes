import type { SubscriptionRange } from "@/contracts/notifications";
export function subscriptionProposal(range: SubscriptionRange, code: string, isTest: boolean, paymentTest = false) {
  return `${paymentTest ? "PRUEBA DE PAGO REAL · " : isTest ? "DEMO · " : ""}Ruta: ${range.label}. Km aprox. del mapa ${range.startKm.toFixed(1)}–${range.endKm.toFixed(1)} (no oficiales). Alertas por 7 días desde esta solicitud, pago único USD 0,001 por Qatom, sin renovación automática. Avisaremos de reportes SIN CONFIRMAR, cambios SUTRAN y posibles huaicos estimados. Escribe ACTIVAR ${code} para aceptar y pedir el enlace de pago; se habilita al confirmar Qatom el cobro. BAJA cancela. Fuera de 24 h se requiere plantilla aprobada. Solo números de prueba configurados pueden usar DEMO sin pagar.`;
}
export const ROUTE_ORIGIN_PROMPT =
  "¿Dónde empieza tu ruta por PE-22? Comparte un pin de WhatsApp sobre la vía, un lugar del catálogo o KM seguido de la distancia aproximada del mapa (no del hito oficial). Después te pediré el destino. No seguimos tu ubicación en vivo. CANCELAR descarta esta propuesta; STOP cancela las alertas.";
export function routeDestinationPrompt(label: string) {
  return `Origen: ${label}. Ahora comparte el pin del destino sobre PE-22, un lugar del catálogo o KM del mapa. Solo cubrimos el eje PE-22 disponible, sin rutas alternativas. Aún no se activaron nuevas alertas. CANCELAR descarta esta propuesta.`;
}
