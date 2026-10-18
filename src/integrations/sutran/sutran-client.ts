import { z } from "zod";

import type { SutranAlertRecord, SutranEvidenceRecord, SutranHistoryRecord } from "@/domain/road-alerts/normalize";
import { getJson, UpstreamError, type RequestOptions } from "@/integrations/http/fetch-json";
import { logger } from "@/lib/logger";

import {
  envelope,
  parseEach,
  SutranAlertDetailSchema,
  SutranAlertRecordSchema,
  SutranEvidenceRecordSchema,
  SutranHistoryRecordSchema,
} from "./schemas";

const PROVIDER = "sutran";
/** Detail and history are secondary to the alert list; one retry bounds their latency (~17 s worst case). */
const SECONDARY_RETRIES = 1;

export interface CallContext {
  requestId?: string;
}

export interface SutranAlertDetail {
  subcauseLabel: string | null;
  tags: string[];
  evidence: SutranEvidenceRecord[];
}

/** Source of official road alerts. Implemented by SUTRAN; replaceable by a fake in tests. */
export interface RoadAlertsProvider {
  readonly endpoint: string;
  listAlerts(ctx: CallContext): Promise<{ records: SutranAlertRecord[]; invalidCount: number }>;
  getAlertDetail(id: string, ctx: CallContext): Promise<SutranAlertDetail>;
  getAlertHistory(id: string, ctx: CallContext): Promise<SutranHistoryRecord[]>;
}

interface SutranClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  sleep?: RequestOptions["sleep"];
}

function formatError(operation: string): UpstreamError {
  return new UpstreamError(`Formato inesperado en ${operation}`, "invalid_body", PROVIDER);
}

export function createSutranClient({ baseUrl, fetchImpl, sleep }: SutranClientOptions): RoadAlertsProvider {
  const base = baseUrl.replace(/\/+$/, "");
  const request = (path: string, operation: string, ctx: CallContext, retries?: number) =>
    getJson(`${base}${path}`, { provider: PROVIDER, operation, requestId: ctx.requestId, fetchImpl, sleep, retries });

  return {
    endpoint: `${base}/alerts`,

    async listAlerts(ctx) {
      const body = envelope(z.array(z.unknown())).safeParse(await request("/alerts", "sutran.alerts.list", ctx));
      if (!body.success || body.data.success === false) throw formatError("alerts");
      const { valid, invalidCount } = parseEach(body.data.data, SutranAlertRecordSchema);
      if (invalidCount > 0) {
        logger.warn({ operation: "sutran.alerts.validate", provider: PROVIDER, requestId: ctx.requestId, result: "skipped", invalidCount });
      }
      return { records: valid, invalidCount };
    },

    async getAlertDetail(id, ctx) {
      const body = envelope(SutranAlertDetailSchema).safeParse(
        await request(`/alerts/${encodeURIComponent(id)}`, "sutran.alerts.detail", ctx, SECONDARY_RETRIES),
      );
      if (!body.success || body.data.success === false) throw formatError("detail");
      const detail = body.data.data;
      return {
        subcauseLabel: detail.submotivoLabel?.trim() || null,
        tags: (detail.etiquetasLabels ?? []).filter((tag) => tag.trim() !== ""),
        evidence: parseEach(detail.evidencia ?? [], SutranEvidenceRecordSchema).valid,
      };
    },

    async getAlertHistory(id, ctx) {
      const body = envelope(z.array(z.unknown())).safeParse(
        await request(`/alerts/${encodeURIComponent(id)}/historial`, "sutran.alerts.history", ctx, SECONDARY_RETRIES),
      );
      if (!body.success || body.data.success === false) throw formatError("historial");
      return parseEach(body.data.data, SutranHistoryRecordSchema).valid;
    },
  };
}
