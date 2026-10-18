import { createHash, randomUUID } from "node:crypto";
import type { RoadContextRequest, RoadContextResponse } from "@peruroad/road-data/context/contracts";
import { roadContextResponseSchema } from "@peruroad/road-data/context/contracts";
import type { SubscriptionRouter, SubscriptionRange } from "@/contracts/notifications";
import type { SubscriptionRepository, SubscriptionAction } from "@/db/subscriptions";
import { keyedDigest, phoneKey } from "@/integrations/security/contacts";
import { logger } from "@/lib/logger";
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
}): SubscriptionRouter {
  return {
    async touch(message) {
      const now = deps.now();
      const at = Math.min(now, message.providerTimestamp ?? now);
      await deps.repository.touch(senderKey(message.from, deps.pepper), new Date(at).toISOString());
    },
    async handle(message, requestId, intent) {
      if (message.messageType !== "text") return null;
      const text = message.text.trim();
      const normalized = text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
      const stop = ["BAJA", "STOP"].includes(normalized) || intent === "unsubscribe";
      const activate = /^ACTIVAR\s+([A-F0-9]{8})$/.exec(normalized);
      const subscribe = /^(SUSCRIBIR|AVISAME)(?:\s|$)/.test(normalized) || intent === "subscribe";
      if (!stop && !activate && !subscribe) return null;
      const key = senderKey(message.from, deps.pepper);
      let action: SubscriptionAction;
      if (stop) action = { kind: "stop" };
      else if (activate) action = { kind: "activate", code: activate[1] ?? "" };
      else {
        const isTest = /\bPRUEBA\b/.test(normalized) || deps.testKeys.includes(key);
        const requested = text
          .replace(/^(SUSCRIBIR|AV[IÍ]SAME)\s*/i, "")
          .replace(/\bPRUEBA\b/gi, "")
          .trim();
        let range: SubscriptionRange;
        try {
          const bounds = await deps.repository.bounds(deps.revision);
          if (!requested || /^(?:de\s+)?(?:la\s+)?(?:central|pe-?22|carretera central)$/i.test(requested))
            range = { ...bounds, geometryRevision: deps.revision, label: "PE-22 · eje disponible Lima–La Oroya" };
          else {
            const ends = requested.split(/\s*[–—-]\s*|\s+a\s+/i).map((v) => v.trim());
            if (ends.length !== 2 || !ends[0] || !ends[1])
              return "Indica dos lugares: SUSCRIBIR Chosica–La Oroya, o SUSCRIBIR para todo el eje PE-22 disponible. Puedes añadir PRUEBA para una demostración.";
            const positions = [];
            for (const name of ends) {
              const c = roadContextResponseSchema.parse(await deps.context({ kind: "place", name }, requestId));
              if (
                c.kind !== "location" ||
                c.state !== "ready" ||
                c.status !== "matched" ||
                !c.location ||
                c.location.geometryRevision !== deps.revision
              )
                return "No pude verificar ambos extremos del tramo. Usa lugares del catálogo PE-22, o SUSCRIBIR para todo el eje disponible.";
              positions.push(c.location.distanceFromOriginKm);
            }
            const startKm = Math.min(...positions),
              endKm = Math.max(...positions);
            if (endKm <= startKm) return "Los extremos deben ser distintos. Ejemplo: SUSCRIBIR Chosica–La Oroya.";
            range = { startKm, endKm, label: ends.join("–"), geometryRevision: deps.revision };
          }
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
        action = { kind: "prepare", range, code: (deps.newId ?? randomUUID)().replaceAll("-", "").slice(0, 8).toUpperCase(), isTest };
      }
      return deps.repository.act({
        key,
        eventKey: createHash("sha256").update(`subscription:${message.messageId}`).digest("hex"),
        destination: message.from,
        action,
        now: new Date(deps.now()).toISOString(),
        isTeam: deps.teamKeys.includes(key),
        isTest: deps.testKeys.includes(key),
      });
    },
  };
}
