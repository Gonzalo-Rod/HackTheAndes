import { describe, expect, it } from "vitest";

import type { RoadAlert } from "@/contracts/road-alerts";
import { DAY_MS, limaIsoDate, startOfLimaDayMs } from "@/lib/time";
import { SUTRAN_ALERT_PE22 } from "@/test/fixtures/sutran";

import { normalizeSutranAlert } from "./normalize";
import {
  countBefore,
  cumulativeByDay,
  eventTimeMs,
  hiddenAtCursor,
  nextEventTime,
  previousEventTime,
  timelineWindow,
} from "./timeline";

const base = normalizeSutranAlert(SUTRAN_ALERT_PE22);
if (!base) throw new Error("fixture must normalize");
const at = (id: string, eventDate: string | null): RoadAlert => ({ ...base, id, eventDate });

const alerts = [at("a", "2026-10-11"), at("b", "2026-10-15"), at("c", "2026-10-17"), at("old", "2026-06-26"), at("undated", null)];
const NOW = Date.parse("2026-10-17T18:30:00Z"); // 13:30 in Lima

describe("Lima time zone boundaries", () => {
  it("assigns instants to the Lima calendar day", () => {
    expect(limaIsoDate(Date.parse("2026-10-18T04:59:59Z"))).toBe("2026-10-17");
    expect(limaIsoDate(Date.parse("2026-10-18T05:00:00Z"))).toBe("2026-10-18");
    expect(new Date(startOfLimaDayMs(NOW)).toISOString()).toBe("2026-10-17T05:00:00.000Z");
  });

  it("places event dates at noon Lima time", () => {
    expect(new Date(eventTimeMs(at("x", "2026-10-17")) ?? 0).toISOString()).toBe("2026-10-17T17:00:00.000Z");
    expect(eventTimeMs(at("x", null))).toBeNull();
  });
});

describe("timelineWindow", () => {
  it("covers the last 7 and 30 Lima days ending now", () => {
    expect(timelineWindow(alerts, "7d", NOW)).toEqual({ startMs: Date.parse("2026-10-11T05:00:00Z"), endMs: NOW });
    expect(timelineWindow(alerts, "30d", NOW).startMs).toBe(Date.parse("2026-09-18T05:00:00Z"));
  });

  it("reaches back to the earliest event for 'todo'", () => {
    expect(timelineWindow(alerts, "todo", NOW).startMs).toBe(Date.parse("2026-06-26T05:00:00Z"));
    expect(timelineWindow([], "todo", NOW).startMs).toBe(startOfLimaDayMs(NOW));
  });
});

describe("cursor helpers", () => {
  it("hides alerts dated after the cursor and never hides undated ones", () => {
    const cursor = Date.parse("2026-10-15T20:00:00Z");
    expect([...hiddenAtCursor(alerts, cursor)]).toEqual(["c"]);
  });

  it("steps between event times", () => {
    const b = eventTimeMs(alerts[1]) ?? 0;
    expect(nextEventTime(alerts, b)).toBe(eventTimeMs(alerts[2]));
    expect(previousEventTime(alerts, b)).toBe(eventTimeMs(alerts[0]));
    expect(nextEventTime(alerts, NOW)).toBeNull();
  });

  it("counts alerts before a time", () => {
    expect(countBefore(alerts, Date.parse("2026-10-11T00:00:00Z"))).toBe(1);
  });
});

describe("cumulativeByDay", () => {
  it("accumulates per Lima day, including alerts before the window", () => {
    const points = cumulativeByDay(alerts, timelineWindow(alerts, "7d", NOW));
    expect(points).toHaveLength(7);
    expect(points[0]).toMatchObject({ total: 2, added: 1 }); // 'old' + 'a'
    expect(points.at(-1)).toMatchObject({ total: 4, added: 1 });
    expect(points[1].dayStartMs - points[0].dayStartMs).toBe(DAY_MS);
  });
});
