import type { AlertPassCheckout, AlertPassPayments } from "@/contracts/alert-passes";
import type { AlertPassRequestRepository } from "@/db/alert-pass-requests";
import { passDeadline } from "@/domain/subscriptions/alert-pass";
import { logger } from "@/lib/logger";

export function createAlertPassPayments(deps: {
  repository: AlertPassRequestRepository;
  provider: AlertPassCheckout;
  now: () => number;
}): AlertPassPayments {
  return {
    async checkout(key, traceId, eventKey) {
      const request = await deps.repository.claim(key, deps.now(), eventKey);
      if (!request) return null;
      if (request.status === "paid")
        return request.active
          ? `Qatom confirmó tu pago. Alertas activas hasta ${passDeadline(request.expiresAt.toISOString())} (Perú). Sin renovación automática. BAJA cancela.`
          : "Tu pase pagado venció o fue cancelado. No hay renovación ni cobro automático. SUSCRIBIR inicia una nueva solicitud.";
      if (request.status !== "pending" || request.expiresAt.getTime() <= deps.now())
        return "Esta solicitud fue cancelada o expiró. No se activaron alertas. Escribe SUSCRIBIR para iniciar otra.";
      let url = request.url;
      if (!url && !request.leaseId)
        return "El enlace de Qatom se está preparando. Aún no se activaron nuevas alertas. Escribe PAGAR en un momento.";
      if (!url && request.leaseId) {
        try {
          url = await deps.provider.create(request.id, traceId);
          if (!(await deps.repository.save(request.id, request.leaseId, url, deps.now())))
            return "La solicitud cambió o expiró mientras se preparaba el pago. No uses un enlace anterior; escribe PAGAR para consultar.";
        } catch (error) {
          await deps.repository.release(request.id, request.leaseId);
          logger.warn({
            requestId: traceId,
            operation: "subscription.checkout",
            provider: "qatom",
            result: "fallback",
            errorType: error instanceof Error ? error.name : "UnknownError",
          });
          return "Qatom no está disponible para preparar el enlace. No se activaron nuevas alertas. Escribe PAGAR para reintentar; no se realizó un cobro desde este chat.";
        }
      }
      return `Alertas por 7 días desde tu solicitud. Pago único: USD 0,001. Vence ${passDeadline(request.expiresAt.toISOString())} (Perú), sin renovación automática. Completa el pago en Qatom: ${url}\nSe habilita al verificar Qatom el cobro. Después escribe PAGO para consultar. BAJA cancela.`;
    },
  };
}
