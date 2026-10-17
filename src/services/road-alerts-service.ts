import type { AlertDetailResponse, AlertsResponse } from "@/contracts/road-alerts";
import {
  latestActionAt,
  normalizeSutranAlerts,
  normalizeSutranEvidence,
  normalizeSutranHistory,
} from "@/domain/road-alerts/normalize";
import { UpstreamError } from "@/integrations/http/fetch-json";
import type { CallContext, RoadAlertsProvider } from "@/integrations/sutran/sutran-client";
import { logger } from "@/lib/logger";
import { err, ok, type Result } from "@/lib/result";

/** SUTRAN alerts change over minutes; one upstream call per minute per server instance keeps load low. */
export const ALERTS_CACHE_TTL_MS = 60_000;
/** A manual refresh bypasses the cache only if it is at least this old, so repeated clicks cannot flood SUTRAN. */
export const FORCED_REFRESH_MIN_AGE_MS = 15_000;
export const DETAIL_CACHE_TTL_MS = 60_000;
const DETAIL_CACHE_MAX_ENTRIES = 200;

export type RoadAlertsErrorCode = "upstream_unavailable" | "upstream_format" | "not_found";

export interface RoadAlertsError {
  code: RoadAlertsErrorCode;
  message: string; // user-facing (Spanish)
}

interface Dependencies {
  provider: RoadAlertsProvider;
  now?: () => number;
}

function describe(error: unknown): RoadAlertsError {
  if (error instanceof UpstreamError) {
    if (error.kind === "http" && error.status === 404) return { code: "not_found", message: "La alerta ya no está disponible en SUTRAN." };
    if (error.kind === "invalid_body") return { code: "upstream_format", message: "SUTRAN respondió con un formato inesperado." };
    return { code: "upstream_unavailable", message: `SUTRAN no respondió (${error.message}).` };
  }
  // Not an upstream failure: a bug, so it must surface rather than become a fallback.
  throw new Error("Unexpected failure in the road alerts service", { cause: error });
}

export function createRoadAlertsService({ provider, now = Date.now }: Dependencies) {
  let alertsCache: { response: AlertsResponse; storedAtMs: number } | null = null;
  let inflight: Promise<AlertsResponse> | null = null;
  const detailCache = new Map<string, { response: AlertDetailResponse; storedAtMs: number }>();
  const detailInflight = new Map<string, Promise<Result<AlertDetailResponse, RoadAlertsError>>>();

  async function fetchFresh(ctx: CallContext): Promise<AlertsResponse> {
    const { records, invalidCount } = await provider.listAlerts(ctx);
    const { alerts, skippedCount } = normalizeSutranAlerts(records);
    const fetchedAt = new Date(now()).toISOString();
    return {
      alerts,
      meta: {
        source: "SUTRAN",
        endpoint: provider.endpoint,
        fetchedAt,
        servedAt: fetchedAt,
        latestActionAt: latestActionAt(alerts),
        stale: false,
        staleReason: null,
        skippedCount: skippedCount + invalidCount,
      },
    };
  }

  async function getCurrentAlerts(
    options: { forceRefresh?: boolean } & CallContext = {},
  ): Promise<Result<AlertsResponse, RoadAlertsError>> {
    const ageMs = alertsCache ? now() - alertsCache.storedAtMs : Infinity;
    const maxAgeMs = options.forceRefresh ? FORCED_REFRESH_MIN_AGE_MS : ALERTS_CACHE_TTL_MS;
    if (alertsCache && ageMs < maxAgeMs) {
      const { response } = alertsCache;
      return ok({ ...response, meta: { ...response.meta, servedAt: new Date(now()).toISOString() } });
    }

    // Concurrent requests share one upstream call.
    inflight ??= fetchFresh(options).finally(() => {
      inflight = null;
    });
    try {
      const response = await inflight;
      alertsCache = { response, storedAtMs: now() };
      return ok(response);
    } catch (error) {
      const failure = describe(error);
      if (!alertsCache) return err(failure);
      logger.warn({ operation: "roadAlerts.current", provider: "sutran", requestId: options.requestId, result: "fallback", errorCode: failure.code });
      const { response } = alertsCache;
      return ok({
        ...response,
        meta: {
          ...response.meta,
          servedAt: new Date(now()).toISOString(),
          stale: true,
          staleReason: `${failure.message} Se muestra la última respuesta válida.`,
        },
      });
    }
  }

  async function getAlertDetail(id: string, ctx: CallContext = {}): Promise<Result<AlertDetailResponse, RoadAlertsError>> {
    const cached = detailCache.get(id);
    if (cached && now() - cached.storedAtMs < DETAIL_CACHE_TTL_MS) return ok(cached.response);
    // Concurrent requests for the same alert share one pair of upstream calls.
    const pending = detailInflight.get(id) ?? fetchDetail(id, ctx).finally(() => detailInflight.delete(id));
    detailInflight.set(id, pending);
    return pending;
  }

  async function fetchDetail(id: string, ctx: CallContext): Promise<Result<AlertDetailResponse, RoadAlertsError>> {

    const [detail, history] = await Promise.allSettled([provider.getAlertDetail(id, ctx), provider.getAlertHistory(id, ctx)]);
    if (detail.status === "rejected") return err(describe(detail.reason));
    if (history.status === "rejected") {
      // The detail is still useful without its history; the UI shows "historial no disponible".
      logger.warn({ operation: "roadAlerts.history", provider: "sutran", requestId: ctx.requestId, result: "fallback" });
    }

    const response: AlertDetailResponse = {
      id,
      subcause: detail.value.subcauseLabel,
      tags: detail.value.tags,
      evidence: normalizeSutranEvidence(detail.value.evidence),
      history: history.status === "fulfilled" ? normalizeSutranHistory(history.value) : null,
      fetchedAt: new Date(now()).toISOString(),
    };
    detailCache.set(id, { response, storedAtMs: now() });
    if (detailCache.size > DETAIL_CACHE_MAX_ENTRIES) {
      const oldestKey = detailCache.keys().next().value;
      if (oldestKey !== undefined) detailCache.delete(oldestKey);
    }
    return ok(response);
  }

  return { getCurrentAlerts, getAlertDetail };
}

export type RoadAlertsService = ReturnType<typeof createRoadAlertsService>;
