import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OfficialAlertRepositoryError,
  type OfficialAlertRepository,
  type OfficialAlertTransaction,
  type OfficialAlertSource,
  type StoredOfficialAlert,
} from "../../src/contracts/ingestion.ts";
import type {
  OfficialRoadAlert,
  OfficialAlertHistoryEntry,
  SourceBatch,
} from "../../src/contracts/road-alerts.ts";
import { createSutranAdapter } from "../../src/integrations/sutran/adapter.ts";
import { sourceHistoryKey } from "../../src/domain/road-data/official-alert-update.ts";

export async function fixtureAlert(
  overrides: Partial<OfficialRoadAlert> = {},
): Promise<OfficialRoadAlert> {
  const payload: unknown = JSON.parse(
    readFileSync(new URL("../sutran/fixtures/alerts.json", import.meta.url), "utf8"),
  );
  const adapter = createSutranAdapter({
    transport: { getJson: async () => payload },
    clock: () => new Date("2026-10-17T18:30:00.000Z"),
  });
  const batch = await adapter.fetchCurrentAlerts();
  const alert = batch.records[0];
  assert.ok(alert);
  return { ...alert, ...overrides };
}

export function batch<T>(records: T[], rejected = 0): SourceBatch<T> {
  return {
    records,
    complete: rejected === 0,
    receivedCount: records.length + rejected,
    filteredCount: 0,
    retrievedAt: "2026-10-17T18:30:00.000Z",
    sourceUrl: "https://api.sigea.sutran.gob.pe/public/alerts",
    rejected: Array.from({ length: rejected }, (_, index) => ({
      index: records.length + index,
      issues: [{ path: "lat", message: "Invalid latitude" }],
    })),
  };
}

export function publication(alert: OfficialRoadAlert): OfficialAlertHistoryEntry {
  return {
    source: "sutran",
    externalId: alert.externalId,
    occurredAt: alert.sourceUpdatedAt ?? "2026-10-17T15:00:00.000Z",
    eventType: "publicacion",
    roadStatus: null,
    sourceRoadStatus: null,
  };
}

export class TestSource implements OfficialAlertSource {
  alerts: SourceBatch<OfficialRoadAlert>;
  history: SourceBatch<OfficialAlertHistoryEntry>;
  alertsError: Error | null = null;
  historyError: Error | null = null;
  historyCalls: string[] = [];
  requestIds: (string | undefined)[] = [];

  constructor(alert: OfficialRoadAlert) {
    this.alerts = batch([alert]);
    this.history = batch([publication(alert)]);
  }
  async fetchCurrentAlerts(options?: {
    requestId?: string;
  }): Promise<SourceBatch<OfficialRoadAlert>> {
    this.requestIds.push(options?.requestId);
    if (this.alertsError) throw this.alertsError;
    return structuredClone(this.alerts);
  }
  async fetchAlertHistory(
    externalId: string,
    options?: { requestId?: string },
  ): Promise<SourceBatch<OfficialAlertHistoryEntry>> {
    this.historyCalls.push(externalId);
    this.requestIds.push(options?.requestId);
    if (this.historyError) throw this.historyError;
    return structuredClone(this.history);
  }
}

interface MemoryRecord {
  state: StoredOfficialAlert | null;
  snapshots: Map<string, OfficialRoadAlert>;
  history: Map<string, OfficialAlertHistoryEntry>;
}

/** Test-only transactional reference. Never exported as durable production persistence. */
export class TestRepository implements OfficialAlertRepository {
  private records = new Map<string, MemoryRecord>();
  private pending = new Map<string, Promise<void>>();
  failNextSnapshot = false;

  async findById(externalId: string): Promise<StoredOfficialAlert | null> {
    return structuredClone(this.records.get(externalId)?.state ?? null);
  }

  inspect(externalId: string): MemoryRecord {
    return structuredClone(
      this.records.get(externalId) ?? { state: null, snapshots: new Map(), history: new Map() },
    );
  }

  async transaction<T>(
    externalId: string,
    work: (tx: OfficialAlertTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.pending.get(externalId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.pending.set(externalId, tail);
    await previous;
    const draft = this.inspect(externalId);
    const tx: OfficialAlertTransaction = {
      read: async () => structuredClone(draft.state),
      save: async (state) => {
        draft.state = structuredClone(state);
      },
      appendSnapshot: async (alert) => {
        if (this.failNextSnapshot) {
          this.failNextSnapshot = false;
          throw new OfficialAlertRepositoryError();
        }
        draft.snapshots.set(
          alert.sourceUpdatedAt === null
            ? "unknown"
            : new Date(alert.sourceUpdatedAt).toISOString(),
          structuredClone(alert),
        );
      },
      appendHistory: async (entries) => {
        let inserted = 0;
        for (const entry of entries) {
          const key = sourceHistoryKey(entry);
          if (!draft.history.has(key)) {
            draft.history.set(key, structuredClone(entry));
            inserted++;
          }
        }
        return inserted;
      },
    };
    try {
      const result = await work(tx);
      this.records.set(externalId, draft);
      return result;
    } finally {
      release();
      if (this.pending.get(externalId) === tail) this.pending.delete(externalId);
    }
  }
}
