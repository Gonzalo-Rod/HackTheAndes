import { after } from "next/server";
import { runAlertEvaluation } from "./runtime";
import { logger } from "@/lib/logger";
import { evaluateRouteWatchSafely } from "@/services/route-watch/source-change";
/** The persisted source state and recovery job survive a lost background invocation. */
export function evaluateAlertsAfterChange(requestId: string): void {
  const failed = (error: unknown) =>
    logger.warn({
      requestId,
      operation: "alerts.source_change",
      provider: "notification-worker",
      result: "fallback",
      recovery: "scheduled_reconciliation",
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  try {
    after(async () => {
      try {
        await runAlertEvaluation(requestId);
      } catch (error) {
        failed(error);
      }
      // Independent of WhatsApp delivery: a new huaico report can also warrant a monitor call.
      await evaluateRouteWatchSafely(requestId);
    });
  } catch (error) {
    failed(error);
  }
}
