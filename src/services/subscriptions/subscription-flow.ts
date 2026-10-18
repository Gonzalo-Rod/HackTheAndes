import { createHash, randomUUID } from "node:crypto";
import type { RoadContextRequest, RoadContextResponse } from "@peruroad/road-data/context/contracts";
import type { SubscriptionRouter, SubscriptionRange } from "@/contracts/notifications";
import type { SubscriptionRepository, SubscriptionAction } from "@/db/subscriptions";
import { keyedDigest, phoneKey } from "@/integrations/security/contacts";
import { createRouteFlow } from "./route-flow";
import { logger } from "@/lib/logger";
import type { AlertPassPayments } from "@/contracts/alert-passes";
export function senderKey(from: string, pepper: string) {
  return phoneKey(from, pepper) ?? keyedDigest(from, pepper, "zavu-contact-v1");
}
export function createSubscriptionFlow(deps: {
  repository: SubscriptionRepository;
  context: (input: RoadContextRequest, requestId: string) => Promise<RoadContextResponse>;
  pepper: string;
  revision: string;
  teamKeys: readonly string[];
  testKeys: readonly string[];
  now: () => number;
  newId?: () => string;
  payments?: AlertPassPayments;
}): SubscriptionRouter {
  const route = createRouteFlow(deps);
  return {
    async touch(message) {
      const now = deps.now();
      const at = Math.min(now, message.providerTimestamp ?? now);
      await deps.repository.touch(senderKey(message.from, deps.pepper), new Date(at).toISOString());
    },
    async handle(message, requestId, intent) {
      const key = senderKey(message.from, deps.pepper);
      const eventKey = createHash("sha256").update(`subscription:${message.messageId}`).digest("hex");
      const act = (action: SubscriptionAction) =>
        deps.repository.act({
          key,
          eventKey,
          destination: message.from,
          action,
          now: new Date(deps.now()).toISOString(),
          isTeam: deps.teamKeys.includes(key),
          isTest: deps.testKeys.includes(key),
        });
      const routed = await route(message, requestId, { key, eventKey, isTest: deps.testKeys.includes(key) }, act);
      if (routed) return routed;
      if (message.messageType !== "text") return null;
      const text = message.text.trim();
      const normalized = text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
      if (["PAGAR", "PAGO"].includes(normalized))
        return (
          (await deps.payments?.checkout(key, requestId)) ??
          "No hay una solicitud de pago pendiente. Escribe SUSCRIBIR 7 DIAS para elegir el tramo."
        );
      const stop = ["BAJA", "STOP"].includes(normalized) || intent === "unsubscribe";
      const activate = /^ACTIVAR\s+([A-F0-9]{8})$/.exec(normalized);
      const subscribe = /^(SUSCRIBIR|AVISAME)(?:\s|$)/.test(normalized) || intent === "subscribe";
      if (!stop && !activate && !subscribe) return null;
      let action: SubscriptionAction;
      if (stop) action = { kind: "stop" };
      else if (activate) action = { kind: "activate", code: activate[1] ?? "" };
      else {
        const paymentTest = normalized === "SUSCRIBIR PAGO PRUEBA";
        if (paymentTest && !deps.testKeys.includes(key))
          return "La prueba de pago es solo para números de prueba configurados. Para contratar alertas, escribe SUSCRIBIR 7 DIAS.";
        // The proposal selects paid versus free DEMO access; sender classification stays independent.
        const isTest = !paymentTest && (/\bPRUEBA\b/.test(normalized) || deps.testKeys.includes(key));
        const requested = (paymentTest || intent === "subscribe" ? "" : text)
          .replace(/^(SUSCRIBIR|AV[IÍ]SAME)\s*/i, "")
          .replace(/^(?:7\s*D[IÍ]AS|UNA\s+SEMANA|POR\s+UNA\s+SEMANA)\s*/i, "")
          .replace(/\bPRUEBA\b/gi, "")
          .trim();
        let range: SubscriptionRange;
        if (requested)
          return "SUSCRIBIR compra el pase de 7 días. Para elegir origen y destino, usa RUTA después de activar tu pase; no pagarás otra vez por cambiar el tramo.";
        try {
          const bounds = await deps.repository.bounds(deps.revision);
          range = { ...bounds, geometryRevision: deps.revision, label: "PE-22 · acceso por 7 días; ruta por elegir" };
        } catch (error) {
          logger.warn({
            requestId,
            operation: "subscription.locate",
            provider: "supabase",
            result: "fallback",
            errorType: error instanceof Error ? error.name : "UnknownError",
          });
          return "No pude verificar el tramo ahora. No se activó una nueva suscripción. Intenta más tarde.";
        }
        action = {
          kind: "prepare",
          range,
          code: (deps.newId ?? randomUUID)().replaceAll("-", "").slice(0, 8).toUpperCase(),
          isTest,
          requestedAt: new Date(Math.min(deps.now(), message.providerTimestamp ?? deps.now())).toISOString(),
        };
      }
      const reply = await act(action);
      if (action.kind === "activate") return (await deps.payments?.checkout(key, requestId, eventKey)) ?? reply;
      return reply;
    },
  };
}
