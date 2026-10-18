import type { SubscriptionRange } from "@/contracts/notifications";
export function subscriptionProposal(range: SubscriptionRange, code: string, isTest: boolean) {
  return `${isTest ? "DEMO · " : ""}Ruta: ${range.label}. Km aprox. del mapa ${range.startKm.toFixed(1)}–${range.endKm.toFixed(1)} (no oficiales). Avisaremos de nuevos reportes SIN CONFIRMAR, cambios SUTRAN y posibles huaicos estimados, solo en este tramo y hasta STOP o BAJA. Sin horario de silencio; fuera de 24 h se requiere plantilla aprobada. Escribe ACTIVAR ${code} para autorizar. Tu suscripción anterior sigue hasta confirmar esta ruta.`;
}
export const ROUTE_ORIGIN_PROMPT =
  "¿Dónde empieza tu ruta por PE-22? Comparte un pin de WhatsApp sobre la vía, un lugar del catálogo o KM seguido de la distancia aproximada del mapa (no del hito oficial). Después te pediré el destino. No seguimos tu ubicación en vivo. CANCELAR descarta esta propuesta; STOP cancela las alertas.";
export function routeDestinationPrompt(label: string) {
  return `Origen: ${label}. Ahora comparte el pin del destino sobre PE-22, un lugar del catálogo o KM del mapa. Solo cubrimos el eje PE-22 disponible, sin rutas alternativas. Aún no se activaron nuevas alertas. CANCELAR descarta esta propuesta.`;
}
