import type { ReportWindow } from "@/contracts/weekly-incident-report_christian";
import { DAY_MS, limaDateToUtcMs, limaIsoDate } from "@/lib/time";

// Report windows are ISO weeks (Monday to Sunday) in Lima time, so consecutive weekly
// reports never overlap and every day belongs to exactly one report. Pure functions.

const DAYS_PER_WEEK = 7;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/** Adds whole days to a calendar date (YYYY-MM-DD). */
export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** ISO weekday of a calendar date: 1 is Monday, 7 is Sunday. */
export function isoWeekday(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** The Monday-to-Sunday week that contains a calendar date. */
export function weekContaining(isoDate: string): ReportWindow {
  const startDate = addDays(isoDate, 1 - isoWeekday(isoDate));
  return { startDate, endDate: addDays(startDate, DAYS_PER_WEEK - 1) };
}

/**
 * Weeks a run at `nowMs` updates: the current week, and on Mondays also the week that just
 * ended, so its last day is collected once more before the report is closed.
 */
export function windowsToUpdate(nowMs: number): ReportWindow[] {
  const today = limaIsoDate(nowMs);
  const current = weekContaining(today);
  const previous = weekContaining(addDays(today, -1));
  return previous.startDate === current.startDate ? [current] : [previous, current];
}

export function isDateInWindow(window: ReportWindow, isoDate: string): boolean {
  return isoDate >= window.startDate && isoDate <= window.endDate;
}

/** 00:00 Lima time on the window's first day, as epoch ms. */
export function windowStartMs(window: ReportWindow): number {
  return limaDateToUtcMs(window.startDate, 0);
}

/** 00:00 Lima time on the day after the window's last day (exclusive end), as epoch ms. */
export function windowEndMs(window: ReportWindow): number {
  return limaDateToUtcMs(addDays(window.endDate, 1), 0);
}

/** File-name label: "2026-10-12_18", "2026-10-26_11-01" across months, "2026-12-28_2027-01-03" across years. */
export function windowLabel(window: ReportWindow): string {
  const [startYear, startMonth] = window.startDate.split("-");
  const [endYear, endMonth, endDay] = window.endDate.split("-");
  if (startYear !== endYear) return `${window.startDate}_${window.endDate}`;
  if (startMonth !== endMonth) return `${window.startDate}_${endMonth}-${endDay}`;
  return `${window.startDate}_${endDay}`;
}

/** Heading text: "12–18 October 2026", "26 October – 1 November 2026", "28 December 2026 – 3 January 2027". */
export function windowTitle(window: ReportWindow): string {
  const [startYear, startMonth, startDay] = window.startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = window.endDate.split("-").map(Number);
  const start = { day: startDay, month: MONTHS[startMonth - 1] };
  const end = { day: endDay, month: MONTHS[endMonth - 1] };
  if (startYear !== endYear) return `${start.day} ${start.month} ${startYear} – ${end.day} ${end.month} ${endYear}`;
  if (startMonth !== endMonth) return `${start.day} ${start.month} – ${end.day} ${end.month} ${endYear}`;
  return `${start.day}–${end.day} ${end.month} ${endYear}`;
}
