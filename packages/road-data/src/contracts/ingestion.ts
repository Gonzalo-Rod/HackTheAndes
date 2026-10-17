import { z } from "zod";
import {
  officialRoadAlertSchema,
  officialAlertHistoryEntrySchema,
  type OfficialRoadAlert,
  type OfficialAlertHistoryEntry,
  type SourceBatch,
} from "./road-alerts.ts";

const timestamp = z.iso.datetime({ offset: true });

export const storedOfficialAlertSchema = z.object({
  alert: officialRoadAlertSchema,
  firstObservedAt: timestamp,
  lastObservedAt: timestamp,
  historySynced: z.boolean(),
});
export type StoredOfficialAlert = z.infer<typeof storedOfficialAlertSchema>;

export function sourceBatchSchema<T>(record: z.ZodType<T>) {
  return z
    .object({
      records: z.array(record),
      rejected: z.array(
        z.object({
          index: z.number().int().nonnegative(),
          issues: z.array(z.object({ path: z.string(), message: z.string() })),
        }),
      ),
      complete: z.boolean(),
      receivedCount: z.number().int().nonnegative(),
      filteredCount: z.number().int().nonnegative(),
      retrievedAt: timestamp,
      sourceUrl: z.url(),
    })
    .refine(
      (batch) =>
        batch.receivedCount === batch.records.length + batch.rejected.length + batch.filteredCount,
      "Batch counts do not agree",
    )
    .refine(
      (batch) => batch.complete === (batch.rejected.length === 0),
      "Batch completeness does not agree",
    );
}

export const officialAlertsBatchSchema = sourceBatchSchema(officialRoadAlertSchema);
export const officialHistoryBatchSchema = sourceBatchSchema(officialAlertHistoryEntrySchema);

export interface OfficialAlertSource {
  fetchCurrentAlerts(options?: {
    roadCode?: string;
    signal?: AbortSignal;
    requestId?: string;
  }): Promise<SourceBatch<OfficialRoadAlert>>;
  fetchAlertHistory(
    externalId: string,
    options?: {
      signal?: AbortSignal;
      requestId?: string;
    },
  ): Promise<SourceBatch<OfficialAlertHistoryEntry>>;
}

/** All operations in one callback must commit or roll back together. */
export interface OfficialAlertTransaction {
  read(): Promise<StoredOfficialAlert | null>;
  save(state: StoredOfficialAlert): Promise<void>;
  appendSnapshot(alert: OfficialRoadAlert): Promise<void>;
  /** Return the number inserted; existing identical source events are ignored. */
  appendHistory(entries: readonly OfficialAlertHistoryEntry[]): Promise<number>;
}

export interface OfficialAlertRepository {
  findById(externalId: string): Promise<StoredOfficialAlert | null>;
  /** Serialize by source/external ID, including IDs that do not yet exist. No HTTP inside. */
  transaction<T>(
    externalId: string,
    work: (tx: OfficialAlertTransaction) => Promise<T>,
  ): Promise<T>;
}

export class OfficialAlertRepositoryError extends Error {
  constructor() {
    super("Official alert persistence is unavailable");
    this.name = "OfficialAlertRepositoryError";
  }
}

export type IngestionIssueCode =
  | "invalid_record"
  | "revision_conflict"
  | "missing_source_timestamp"
  | "history_unavailable"
  | "history_partial"
  | "history_deferred"
  | "persistence_unavailable";

export interface IngestionSummary {
  requestId: string;
  roadCode: string;
  retrievedAt: string;
  status: "complete" | "partial";
  received: number;
  selected: number;
  sourceRejected: number;
  inserted: number;
  updated: number;
  unchanged: number;
  stale: number;
  conflicts: number;
  failed: number;
  historyRequests: number;
  historyInserted: number;
  issues: { externalId: string; code: IngestionIssueCode }[];
}

export type IngestionResult =
  | { ok: true; value: IngestionSummary }
  | {
      ok: false;
      error: {
        code: "invalid_options" | "source_unavailable" | "invalid_batch";
        message: string;
      };
    };

export interface IngestionLog {
  requestId: string;
  operation: "sutran.ingest";
  provider: "sutran";
  durationMs: number;
  result: "complete" | "partial" | "failure";
  errorType?: string;
  inserted?: number;
  updated?: number;
  failed?: number;
}
