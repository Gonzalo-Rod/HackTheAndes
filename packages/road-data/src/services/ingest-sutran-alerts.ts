import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  officialAlertsBatchSchema,
  storedOfficialAlertSchema,
  OfficialAlertRepositoryError,
  type OfficialAlertSource,
  type OfficialAlertRepository,
  type StoredOfficialAlert,
  type IngestionResult,
  type IngestionSummary,
  type IngestionLog,
} from "../contracts/ingestion.ts";
import type { OfficialRoadAlert } from "../contracts/road-alerts.ts";
import { decideOfficialAlertUpdate } from "../domain/road-data/official-alert-update.ts";
import { isSourceFailure, readSutranHistory, type HistoryRead } from "./sutran-history.ts";

// Bound provider history calls within one scheduled run; remaining records retry next poll.
const DEFAULT_HISTORY_REQUESTS = 5;
const MAX_HISTORY_REQUESTS = 20;
const optionsSchema = z.object({
  roadCode: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((value) => value.toUpperCase())
    .default("PE-22"),
  requestId: z.string().min(1).max(128),
});

export interface IngestionOptions {
  source: OfficialAlertSource;
  repository: OfficialAlertRepository;
  maxHistoryRequests?: number;
  logger?: (entry: IngestionLog) => void;
}

function validateStored(
  value: StoredOfficialAlert | null,
  externalId: string,
): StoredOfficialAlert | null {
  if (value === null) return null;
  const parsed = storedOfficialAlertSchema.safeParse(value);
  if (!parsed.success || parsed.data.alert.externalId !== externalId)
    throw new OfficialAlertRepositoryError();
  return parsed.data;
}

async function persistAlert(
  repository: OfficialAlertRepository,
  alert: OfficialRoadAlert,
  history: HistoryRead | null,
  signal?: AbortSignal,
) {
  return repository.transaction(alert.externalId, async (tx) => {
    signal?.throwIfAborted();
    // The transaction's locked read is authoritative, not the earlier history-fetch hint.
    const current = validateStored(await tx.read(), alert.externalId);
    const decision = decideOfficialAlertUpdate(current, alert);
    if (decision.kind === "stale" || decision.kind === "conflict") {
      return { decision, historyInserted: 0 };
    }
    let historyInserted = 0;
    if (history !== null) {
      historyInserted = await tx.appendHistory(history.records);
      if (
        !Number.isInteger(historyInserted) ||
        historyInserted < 0 ||
        historyInserted > history.records.length
      ) {
        throw new OfficialAlertRepositoryError();
      }
      if (history.complete) decision.state.historySynced = true;
    }
    if (decision.kind !== "unchanged") await tx.appendSnapshot(alert);
    signal?.throwIfAborted();
    await tx.save(decision.state);
    return { decision, historyInserted };
  });
}

export function createSutranIngestionService({
  source,
  repository,
  maxHistoryRequests = DEFAULT_HISTORY_REQUESTS,
  logger = (entry) => console.error(JSON.stringify(entry)),
}: IngestionOptions) {
  if (
    !Number.isInteger(maxHistoryRequests) ||
    maxHistoryRequests < 0 ||
    maxHistoryRequests > MAX_HISTORY_REQUESTS
  ) {
    throw new RangeError("maxHistoryRequests must be an integer between 0 and 20");
  }

  return {
    async run(
      options: { roadCode?: string; requestId?: string; signal?: AbortSignal } = {},
    ): Promise<IngestionResult> {
      const startedAt = performance.now();
      const requestId = options.requestId ?? randomUUID();
      const log = (
        fields: Pick<IngestionLog, "result" | "errorType" | "inserted" | "updated" | "failed">,
      ) =>
        logger({
          requestId,
          operation: "sutran.ingest",
          provider: "sutran",
          durationMs: performance.now() - startedAt,
          ...fields,
        });
      const input = optionsSchema.safeParse({ roadCode: options.roadCode, requestId });
      if (!input.success) {
        log({ result: "failure", errorType: "invalid_options" });
        return {
          ok: false,
          error: { code: "invalid_options", message: "Invalid ingestion options" },
        };
      }
      options.signal?.throwIfAborted();
      const request = { requestId, ...(options.signal ? { signal: options.signal } : {}) };
      let response;
      try {
        response = await source.fetchCurrentAlerts({ ...request, roadCode: input.data.roadCode });
      } catch (error) {
        options.signal?.throwIfAborted();
        log({
          result: "failure",
          errorType: isSourceFailure(error) ? "source_unavailable" : "unexpected_error",
        });
        if (!isSourceFailure(error)) throw error;
        return {
          ok: false,
          error: {
            code: "source_unavailable",
            message: "Official road data is unavailable; existing records were preserved",
          },
        };
      }
      const parsed = officialAlertsBatchSchema.safeParse(response);
      if (!parsed.success) {
        log({ result: "failure", errorType: "invalid_batch" });
        return {
          ok: false,
          error: {
            code: "invalid_batch",
            message: "The source batch is invalid; existing records were preserved",
          },
        };
      }
      const batch = parsed.data;
      const summary: IngestionSummary = {
        requestId,
        roadCode: input.data.roadCode,
        retrievedAt: batch.retrievedAt,
        status: batch.complete ? "complete" : "partial",
        received: batch.receivedCount,
        selected: batch.records.length,
        sourceRejected: batch.rejected.length,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        stale: 0,
        conflicts: 0,
        failed: 0,
        historyRequests: 0,
        historyInserted: 0,
        issues: [],
      };
      for (const alert of batch.records) {
        options.signal?.throwIfAborted();
        if (alert.roadCode !== input.data.roadCode || alert.expired || alert.notYetValid) {
          summary.failed++;
          summary.issues.push({ externalId: alert.externalId, code: "invalid_record" });
          continue;
        }
        try {
          const current = validateStored(
            await repository.findById(alert.externalId),
            alert.externalId,
          );
          const hint = decideOfficialAlertUpdate(current, alert);
          let history: HistoryRead | null = null;
          if (hint.kind !== "stale" && hint.kind !== "conflict" && !hint.state.historySynced) {
            if (summary.historyRequests < maxHistoryRequests) {
              summary.historyRequests++;
              history = await readSutranHistory(source, alert.externalId, request);
            } else {
              history = { records: [], complete: false, issue: "history_deferred" };
            }
          }
          if (history?.issue) log({ result: "partial", errorType: history.issue });
          options.signal?.throwIfAborted();
          const result = await persistAlert(repository, alert, history, options.signal);
          const decision = result.decision;
          if (decision.kind === "conflict") {
            summary.conflicts++;
            summary.issues.push({ externalId: alert.externalId, code: decision.reason });
          } else {
            summary[decision.kind]++;
            summary.historyInserted += result.historyInserted;
            if (decision.kind !== "stale" && history?.issue) {
              summary.issues.push({ externalId: alert.externalId, code: history.issue });
            }
          }
        } catch (error) {
          options.signal?.throwIfAborted();
          if (!(error instanceof OfficialAlertRepositoryError)) {
            log({ result: "failure", errorType: "unexpected_error" });
            throw error;
          }
          summary.failed++;
          summary.issues.push({ externalId: alert.externalId, code: "persistence_unavailable" });
          log({ result: "partial", errorType: "persistence_unavailable" });
        }
      }
      if (summary.issues.length > 0) summary.status = "partial";
      log({
        result: summary.status,
        inserted: summary.inserted,
        updated: summary.updated,
        failed: summary.failed,
      });
      return { ok: true, value: summary };
    },
  };
}
