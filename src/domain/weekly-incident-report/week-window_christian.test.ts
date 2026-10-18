import { describe, expect, it } from "vitest";

import {
  addDays,
  isDateInWindow,
  isIsoDate,
  isoWeekday,
  weekContaining,
  windowEndMs,
  windowLabel,
  windowStartMs,
  windowsToUpdate,
  windowTitle,
} from "./week-window_christian";

const WEEK_42 = { startDate: "2026-10-12", endDate: "2026-10-18" };

describe("weekContaining", () => {
  it("returns the Monday-to-Sunday week of a date", () => {
    expect(weekContaining("2026-10-17")).toEqual(WEEK_42);
  });

  it("puts Monday and Sunday in the same week, and the next Monday in the next one", () => {
    expect(weekContaining("2026-10-12")).toEqual(WEEK_42);
    expect(weekContaining("2026-10-18")).toEqual(WEEK_42);
    expect(weekContaining("2026-10-19").startDate).toBe("2026-10-19");
  });

  it("crosses month and year boundaries", () => {
    expect(weekContaining("2026-11-01")).toEqual({ startDate: "2026-10-26", endDate: "2026-11-01" });
    expect(weekContaining("2027-01-01")).toEqual({ startDate: "2026-12-28", endDate: "2027-01-03" });
  });
});

describe("windowsToUpdate", () => {
  it("updates only the current week from Thursday to Sunday", () => {
    expect(windowsToUpdate(Date.parse("2026-10-17T21:00:00Z"))).toEqual([WEEK_42]);
  });

  it("also closes the previous week on a Monday", () => {
    // 12:00 UTC is 07:00 in Lima, the scheduled run time.
    expect(windowsToUpdate(Date.parse("2026-10-19T12:00:00Z"))).toEqual([WEEK_42, { startDate: "2026-10-19", endDate: "2026-10-25" }]);
  });

  it("revisits the previous week through Wednesday to catch reports published late on Tuesday", () => {
    for (const day of ["2026-10-20", "2026-10-21"]) {
      expect(windowsToUpdate(Date.parse(`${day}T12:00:00Z`))).toEqual([WEEK_42, { startDate: "2026-10-19", endDate: "2026-10-25" }]);
    }
    expect(windowsToUpdate(Date.parse("2026-10-22T12:00:00Z"))).toEqual([{ startDate: "2026-10-19", endDate: "2026-10-25" }]);
  });

  it("uses Lima time at the day boundary", () => {
    // 04:59 UTC on Monday is still Sunday 23:59 in Lima.
    expect(windowsToUpdate(Date.parse("2026-10-19T04:59:00Z"))).toEqual([WEEK_42]);
    expect(windowsToUpdate(Date.parse("2026-10-19T05:00:00Z"))).toHaveLength(2);
  });
});

describe("window bounds", () => {
  it("starts and ends at midnight in Lima", () => {
    expect(new Date(windowStartMs(WEEK_42)).toISOString()).toBe("2026-10-12T05:00:00.000Z");
    expect(new Date(windowEndMs(WEEK_42)).toISOString()).toBe("2026-10-19T05:00:00.000Z");
  });

  it("includes both edge dates and nothing outside them", () => {
    expect(isDateInWindow(WEEK_42, "2026-10-12")).toBe(true);
    expect(isDateInWindow(WEEK_42, "2026-10-18")).toBe(true);
    expect(isDateInWindow(WEEK_42, "2026-10-11")).toBe(false);
    expect(isDateInWindow(WEEK_42, "2026-10-19")).toBe(false);
  });
});

describe("labels", () => {
  it("names files like the manual research notes", () => {
    expect(windowLabel(WEEK_42)).toBe("2026-10-12_18");
    expect(windowLabel({ startDate: "2026-10-26", endDate: "2026-11-01" })).toBe("2026-10-26_11-01");
    expect(windowLabel({ startDate: "2026-12-28", endDate: "2027-01-03" })).toBe("2026-12-28_2027-01-03");
  });

  it("writes readable headings", () => {
    expect(windowTitle(WEEK_42)).toBe("12–18 October 2026");
    expect(windowTitle({ startDate: "2026-10-26", endDate: "2026-11-01" })).toBe("26 October – 1 November 2026");
    expect(windowTitle({ startDate: "2026-12-28", endDate: "2027-01-03" })).toBe("28 December 2026 – 3 January 2027");
  });
});

describe("date helpers", () => {
  it("accepts only real calendar dates in YYYY-MM-DD", () => {
    expect(isIsoDate("2026-10-17")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("17/10/2026")).toBe(false);
    expect(isIsoDate("2026-1-5")).toBe(false);
  });

  it("counts ISO weekdays from Monday", () => {
    expect(isoWeekday("2026-10-12")).toBe(1);
    expect(isoWeekday("2026-10-11")).toBe(7);
  });

  it("adds days across months", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
