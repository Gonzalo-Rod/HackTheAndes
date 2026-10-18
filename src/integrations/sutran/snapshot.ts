import { z } from "zod";

import type { SutranAlertRecord } from "@/domain/road-alerts/normalize";
import { logger } from "@/lib/logger";

import snapshotFile from "./alerts-snapshot.json";
import { parseEach, SutranAlertRecordSchema } from "./schemas";

// Last-resort fallback (team plan, section 11: "fall back to the last snapshot, labeled with
// its time"). The file is a raw capture of SUTRAN's /public/alerts made by
// `npm run data:snapshot`; it is real data, never sample data, and is served only when
// SUTRAN fails and the server has no cached response (for example, right after a cold start).

const SnapshotFileSchema = z.object({
  capturedAt: z.iso.datetime({ offset: true }),
  source: z.string(),
  records: z.array(z.unknown()),
});

export interface AlertsSnapshot {
  capturedAt: string;
  records: SutranAlertRecord[];
}

export function parseAlertsSnapshot(raw: unknown): AlertsSnapshot | null {
  const file = SnapshotFileSchema.safeParse(raw);
  if (!file.success) {
    logger.warn({ operation: "sutran.snapshot.load", provider: "sutran", result: "error", reason: "invalid_snapshot_file" });
    return null;
  }
  const { valid, invalidCount } = parseEach(file.data.records, SutranAlertRecordSchema);
  if (invalidCount > 0) logger.warn({ operation: "sutran.snapshot.load", provider: "sutran", result: "skipped", invalidCount });
  return { capturedAt: file.data.capturedAt, records: valid };
}

export function loadBundledAlertsSnapshot(): AlertsSnapshot | null {
  return parseAlertsSnapshot(snapshotFile);
}
