import { logger } from "@/lib/logger";
import { createDefaultRouteWatchEvaluator } from "./runtime";

type Evaluation = Awaited<ReturnType<ReturnType<typeof createDefaultRouteWatchEvaluator>>>;
export type RouteWatchRun = { ok: true; value: Evaluation } | { ok: false; error: "route_watch_unavailable" };

/**
 * Runs route watch alongside driver alerts when a source changes and on the 5-minute alert job.
 * A route-watch failure (for example an unapplied migration or a Zavu outage) is logged and
 * returned as a value, so it never blocks WhatsApp alert delivery; the next run retries.
 */
export async function evaluateRouteWatchSafely(
  requestId: string,
  evaluate: (requestId: string) => Promise<Evaluation> = (id) => createDefaultRouteWatchEvaluator()(id),
): Promise<RouteWatchRun> {
  try {
    return { ok: true, value: await evaluate(requestId) };
  } catch (error) {
    logger.warn({
      requestId,
      operation: "route_watch.source_change",
      provider: "route-watch",
      result: "fallback",
      recovery: "next_scheduled_run",
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return { ok: false, error: "route_watch_unavailable" };
  }
}
