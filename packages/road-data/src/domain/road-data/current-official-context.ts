import type { z } from "zod";
import type { officialContextArchiveSchema } from "../../contracts/road-context.ts";

// Two missed ten-minute polls make current-condition answers visibly stale.
const MAX_OFFICIAL_DATA_AGE_MS = 20 * 60 * 1000;
// Allow only clock/transaction timestamp rounding around the latest poll's start.
const OBSERVATION_CLOCK_TOLERANCE_MS = 1000;
export function currentOfficialContext(
  archive: z.infer<typeof officialContextArchiveSchema>,
  nowMs: number,
  todayLima: string,
) {
  if (!archive.poll) return null;
  const pollStart = Date.parse(archive.poll.startedAt) - OBSERVATION_CLOCK_TOLERANCE_MS;
  return {
    stale: nowMs - Date.parse(archive.poll.finishedAt) > MAX_OFFICIAL_DATA_AGE_MS,
    asOf: archive.poll.finishedAt,
    alerts: archive.records.filter(
      ({ alert, lastObservedAt }) =>
        alert.roadCode === "PE-22" &&
        Date.parse(lastObservedAt) >= pollStart &&
        (!alert.validFrom || alert.validFrom <= todayLima) &&
        (!alert.validUntil || alert.validUntil >= todayLima),
    ),
  };
}
