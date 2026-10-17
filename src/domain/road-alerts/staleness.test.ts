import { describe, expect, it } from "vitest";

import { countByRoad, hoursSinceAction, isStaleAlert, STALE_ALERT_AFTER_HOURS } from "./staleness";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("staleness", () => {
  it("measures hours since the last action", () => {
    expect(hoursSinceAction({ lastActionAt: hoursAgo(5) }, NOW)).toBeCloseTo(5);
    expect(hoursSinceAction({ lastActionAt: null }, NOW)).toBeNull();
  });

  it("flags only alerts older than the threshold", () => {
    expect(isStaleAlert({ lastActionAt: hoursAgo(STALE_ALERT_AFTER_HOURS - 1) }, NOW)).toBe(false);
    expect(isStaleAlert({ lastActionAt: hoursAgo(STALE_ALERT_AFTER_HOURS + 1) }, NOW)).toBe(true);
    expect(isStaleAlert({ lastActionAt: null }, NOW)).toBe(false);
  });

  it("counts alerts per road code", () => {
    const counts = countByRoad([{ roadCode: "PE-22" }, { roadCode: "PE-22" }, { roadCode: "PE-3N" }]);
    expect(counts.get("PE-22")).toBe(2);
    expect(counts.get("PE-3N")).toBe(1);
  });
});
