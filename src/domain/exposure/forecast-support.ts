import type { EnvironmentalRecord } from "@/contracts/research_christian";
import { evidenceBoundaryMs } from "@/domain/research/evidence-state_christian";
import { inCentralView, isVerifiedMapRecord } from "@/domain/research/map-evidence_christian";

import type { ForecastWindow } from "./forecast-events";

/**
 * Official notices that corroborate an estimated forecast window. The exposure
 * estimate stays the primary method; notices are decision support only and
 * their absence never lowers attention or implies the road is clear.
 */
export type ForecastSupport =
  | { state: "unavailable" }
  | { state: "none" }
  | { state: "corroborated"; precipitationNotices: EnvironmentalRecord[]; criticalZoneCount: number };

/** Only rain and slope hazards relate to possible huaicos; cold warnings do not. */
const SUPPORT_TOPICS = new Set(["rain", "landslides"]);

function overlapsWindow(record: EnvironmentalRecord, window: ForecastWindow): boolean {
  if (!record.startsAt || !record.endsAt) return false;
  const startMs = evidenceBoundaryMs(record.startsAt, false);
  const endMs = evidenceBoundaryMs(record.endsAt, true);
  return startMs < Date.parse(window.validUntil) && endMs >= Date.parse(window.validFrom);
}

function supportsWindow(record: EnvironmentalRecord, window: ForecastWindow): boolean {
  if (record.kind !== "forecast" && record.kind !== "inventory") return false;
  if (!record.topics.some((topic) => SUPPORT_TOPICS.has(topic))) return false;
  return isVerifiedMapRecord(record) && inCentralView(record) && overlapsWindow(record, window);
}

/** `records` is null when the evidence catalog could not be loaded. */
export function forecastSupport(window: ForecastWindow, records: readonly EnvironmentalRecord[] | null): ForecastSupport {
  if (records === null) return { state: "unavailable" };
  const matching = records.filter((record) => supportsWindow(record, window));
  if (!matching.length) return { state: "none" };
  return {
    state: "corroborated",
    precipitationNotices: matching.filter((record) => record.kind === "forecast"),
    criticalZoneCount: matching.filter((record) => record.kind === "inventory").length,
  };
}
