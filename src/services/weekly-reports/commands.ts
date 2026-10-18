import { createHash, randomUUID } from "node:crypto";
import type { WeeklyRouter } from "@/contracts/weekly-pdf";
import type { SubscriptionRepository } from "@/db/subscriptions";
import type { WeeklyPdfRepository } from "@/db/weekly-pdf";
import type { RateLimiter } from "@/db/request-limits";
import { senderKey } from "@/services/subscriptions/subscription-flow";
import { weeklyPeriod } from "@peruroad/road-data/reports";
import type { WeeklyDispatcher } from "./deliver";
import { logger } from "@/lib/logger";
export function createWeeklyCommands(deps: {
  preferences: SubscriptionRepository;
  repository: WeeklyPdfRepository;
  dispatch: WeeklyDispatcher;
  limiter: RateLimiter;
  pepper: string;
  revision: string;
  now: () => number;
}): WeeklyRouter {
  return {
    async handle(message, requestId) {
      if (message.messageType !== "text") return null;
      const text = message.text.trim().toUpperCase();
      if (!/^(SEMANAL(?:\s|$)|PDF$)/.test(text)) return null;
      const key = senderKey(message.from, deps.pepper),
        now = deps.now();
      const eventKey = createHash("sha256").update(`weekly-command:${message.messageId}`).digest("hex");
      try {
        if (text === "PDF") {
          const [target] = await deps.repository.targets(deps.revision, key);
          if (!target)
            return "El PDF semanal requiere autorización aparte. Escribe SEMANAL; si aún no elegiste tramo, empieza con SUSCRIBIR.";
          if (!(await deps.limiter.consume(createHash("sha256").update(`weekly-request:${key}`).digest("hex"), 3, 15 * 60_000, now)))
            return "Ya solicitaste varios PDF. Espera 15 minutos para volver a pedirlo. Tus alertas siguen activas.";
          const pending = await deps.repository.latestPending(target.id, now);
          const period = pending ?? { ...weeklyPeriod(now, true), key: `request:${eventKey}` };
          const state = await deps.dispatch(target, period, requestId);
          return state === "sent"
            ? "PDF enviado como archivo adjunto. Revisa su periodo, fecha de captura y cobertura; no certifica seguridad."
            : state === "unchanged"
              ? "La solicitud ya fue procesada o está en curso. No enviamos un PDF duplicado."
              : "El PDF quedó pendiente; no confirmamos su entrega. Intenta PDF más tarde. ESTADO y EXPOSICION siguen disponibles.";
        }
        const activate = /^SEMANAL ACTIVAR ([A-F0-9]{8})$/.exec(text);
        const action =
          text === "SEMANAL BAJA"
            ? { kind: "weeklyStop" as const }
            : activate
              ? { kind: "weeklyActivate" as const, code: activate[1] ?? "" }
              : text === "SEMANAL"
                ? { kind: "weeklyPrepare" as const, code: randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase() }
                : null;
        if (!action)
          return "SEMANAL solicita el PDF semanal; SEMANAL ACTIVAR <código> lo autoriza; PDF pide un archivo; SEMANAL BAJA cancela solo los informes.";
        return await deps.preferences.act({
          key,
          eventKey,
          destination: message.from,
          action,
          now: new Date(now).toISOString(),
          isTeam: false,
          isTest: false,
        });
      } catch (error) {
        logger.warn({
          requestId,
          operation: "weekly-pdf.command",
          provider: "supabase",
          result: "fallback",
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return "No pude completar la solicitud del PDF ahora. No confirmamos ningún cambio ni entrega. Intenta más tarde.";
      }
    },
  };
}
