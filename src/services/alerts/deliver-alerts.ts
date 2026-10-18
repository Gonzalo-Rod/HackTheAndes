import type { AlertCandidate } from "@/contracts/notifications";
import type { AlertDeliveryRepository } from "@/db/alert-deliveries";
import type { MessagingProvider, TemplateSender } from "@/integrations/messaging/types";
import { logger } from "@/lib/logger";
export function createAlertDispatcher(deps: {
  repository: AlertDeliveryRepository;
  messaging: MessagingProvider;
  templates: TemplateSender;
  revision: string;
  now: () => number;
}) {
  return async (candidates: AlertCandidate[], requestId: string) => {
    const started = performance.now();
    const counts = { checked: 0, sent: 0, pending: 0, failed: 0 };
    for (const id of await deps.repository.subscriptions(deps.revision)) {
      if (performance.now() - started > 80_000) break;
      counts.checked++;
      const delivery = await deps.repository.claim(id, candidates, deps.now());
      if (!delivery) continue;
      try {
        const destination = await deps.repository.destination(delivery, deps.now());
        if (!destination) {
          await deps.repository.finish(delivery, false, "consent_or_validity_changed", deps.now());
          continue;
        }
        const message = {
          to: destination.to,
          text: delivery.body,
          channel: "whatsapp" as const,
          idempotencyKey: `alert:v1:${delivery.id}`,
          requestId,
        };
        let result = destination.windowOpen
          ? await deps.messaging.sendText({ ...message, idempotencyKey: message.idempotencyKey + ":text" })
          : await deps.templates.sendTemplate({ ...message, idempotencyKey: message.idempotencyKey + ":template" });
        if (!result.ok && result.error === "window_closed" && destination.windowOpen)
          result = await deps.templates.sendTemplate({ ...message, idempotencyKey: message.idempotencyKey + ":template" });
        await deps.repository.finish(delivery, result.ok, result.ok ? null : result.error, deps.now());
        if (result.ok) counts.sent++;
        else counts.pending++;
      } catch (error) {
        counts.failed++;
        await deps.repository.finish(delivery, false, "infrastructure_unavailable", deps.now());
        logger.warn({
          requestId,
          operation: "alerts.delivery",
          provider: "zavu-supabase",
          result: "error",
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
    logger.info({
      requestId,
      operation: "alerts.evaluate",
      provider: "zavu",
      durationMs: performance.now() - started,
      result: counts.failed ? "error" : "ok",
      ...counts,
    });
    return counts;
  };
}
