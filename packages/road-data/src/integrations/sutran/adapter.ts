import { z } from "zod";
import type { JsonTransport } from "../http/json-transport.ts";
import type {
  OfficialRoadAlert,
  OfficialAlertHistoryEntry,
  SourceBatch,
  RejectedSourceRecord,
} from "../../contracts/road-alerts.ts";
import { sutranAlertSchema, sutranHistorySchema, sutranEnvelopeSchema } from "./schema.ts";
import { normalizeAlert, normalizeHistoryEntry } from "./normalize.ts";

export const SUTRAN_BASE_URL = "https://api.sigea.sutran.gob.pe/public/";

export class SutranPayloadError extends Error {
  constructor() {
    super("SUTRAN returned a failure envelope or an unsupported response shape");
    this.name = "SutranPayloadError";
  }
}

export interface SutranAdapterOptions {
  transport: JsonTransport;
  clock?: () => Date;
}

export function createSutranAdapter({ transport, clock = () => new Date() }: SutranAdapterOptions) {
  async function readBatch<T, S>(
    url: string,
    schema: z.ZodType<S>,
    normalize: (record: S, retrievedAt: string) => T,
    include: (record: S) => boolean,
    signal?: AbortSignal,
    requestId?: string,
  ): Promise<SourceBatch<T>> {
    const payload = await transport.getJson(url, {
      provider: "sutran",
      ...(signal ? { signal } : {}),
      ...(requestId ? { requestId } : {}),
    });
    const retrievedAt = clock().toISOString();
    const envelope = sutranEnvelopeSchema.safeParse(payload);
    if (!envelope.success) throw new SutranPayloadError();
    const records: T[] = [];
    const rejected: RejectedSourceRecord[] = [];
    let filteredCount = 0;
    envelope.data.data.forEach((raw, index) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        rejected.push({
          index,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.map(String).join("."),
            message: issue.message,
          })),
        });
      } else if (!include(parsed.data)) {
        filteredCount++;
      } else {
        records.push(normalize(parsed.data, retrievedAt));
      }
    });
    return {
      records,
      rejected,
      complete: rejected.length === 0,
      receivedCount: envelope.data.data.length,
      filteredCount,
      retrievedAt,
      sourceUrl: url,
    };
  }

  return {
    /** Keep normal-status records: an incident can be reopened while still in force. */
    fetchCurrentAlerts(
      options: { roadCode?: string; signal?: AbortSignal; requestId?: string } = {},
    ): Promise<SourceBatch<OfficialRoadAlert>> {
      const roadCode = (options.roadCode ?? "PE-22").trim().toUpperCase();
      if (!roadCode) throw new TypeError("roadCode must not be empty");
      return readBatch(
        `${SUTRAN_BASE_URL}alerts`,
        sutranAlertSchema,
        normalizeAlert,
        (record) =>
          record.viaCodigo.toUpperCase() === roadCode && !record.vencida && !record.aunNoVigente,
        options.signal,
        options.requestId,
      );
    },

    /** Does not invent an initial status when SUTRAN publication entries have null. */
    async fetchAlertHistory(
      externalId: string,
      options: { signal?: AbortSignal; requestId?: string } = {},
    ): Promise<SourceBatch<OfficialAlertHistoryEntry>> {
      const id = z.uuid().parse(externalId);
      const batch = await readBatch(
        `${SUTRAN_BASE_URL}alerts/${id}/historial`,
        sutranHistorySchema,
        (record) => normalizeHistoryEntry(record, id),
        () => true,
        options.signal,
        options.requestId,
      );
      return {
        ...batch,
        records: [...batch.records].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
      };
    },
  };
}
