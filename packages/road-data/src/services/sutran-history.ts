import { officialHistoryBatchSchema } from "../contracts/ingestion.ts";
import type { OfficialAlertSource, IngestionIssueCode } from "../contracts/ingestion.ts";
import type { OfficialAlertHistoryEntry } from "../contracts/road-alerts.ts";
import { HttpTransportError } from "../integrations/http/json-transport.ts";
import { SutranPayloadError } from "../integrations/sutran/adapter.ts";

export interface HistoryRead {
  records: readonly OfficialAlertHistoryEntry[];
  complete: boolean;
  issue?: IngestionIssueCode;
}

export function isSourceFailure(error: unknown): boolean {
  return error instanceof HttpTransportError || error instanceof SutranPayloadError;
}

export async function readSutranHistory(
  source: OfficialAlertSource,
  externalId: string,
  options: { signal?: AbortSignal; requestId: string },
): Promise<HistoryRead> {
  try {
    const response = await source.fetchAlertHistory(externalId, options);
    const parsed = officialHistoryBatchSchema.safeParse(response);
    if (!parsed.success) return { records: [], complete: false, issue: "history_partial" };
    const records = parsed.data.records.filter((entry) => entry.externalId === externalId);
    const complete =
      parsed.data.complete &&
      parsed.data.filteredCount === 0 &&
      records.length === parsed.data.records.length;
    return complete ? { records, complete } : { records, complete, issue: "history_partial" };
  } catch (error) {
    options.signal?.throwIfAborted();
    if (!isSourceFailure(error)) throw error;
    return { records: [], complete: false, issue: "history_unavailable" };
  }
}
