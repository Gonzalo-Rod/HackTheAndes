import { DAY_MS, LIMA_TZ, limaDateToUtcMs, startOfLimaDayMs } from "./time";

// Display formatting (Spanish, America/Lima). Timestamps stay in UTC everywhere else.

const LOCALE = "es-PE";
const dateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: LIMA_TZ, day: "numeric", month: "short", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: LIMA_TZ, day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: LIMA_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const weekdayFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: LIMA_TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });
const numberFmt = new Intl.NumberFormat(LOCALE);

const tidy = (s: string) => s.replace(/\./g, "").replace(/\s+de\s+/g, " ");

export const formatNumber = (n: number) => numberFmt.format(n);
export const formatTime = (ms: number) => timeFmt.format(ms);
export const formatShortDate = (ms: number) => tidy(shortDateFmt.format(ms));
export const formatToday = (ms: number) => tidy(weekdayFmt.format(ms));

/** A Lima calendar date (YYYY-MM-DD), e.g. "17 oct 2026". */
export function formatCalendarDate(isoDate: string | null): string {
  return isoDate ? tidy(dateFmt.format(limaDateToUtcMs(isoDate))) : "—";
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  return `${tidy(dateFmt.format(ms))}, ${timeFmt.format(ms)}`;
}

export function formatKm(km: number | null, digits = 1): string {
  return km === null ? "—" : `km ${km.toLocaleString(LOCALE, { maximumFractionDigits: digits })}`;
}

export function formatElevation(meters: number): string {
  return `${numberFmt.format(Math.round(meters))} m`;
}

/** "hace 5 min", "hace 3 h", "ayer, 10:21", "15 oct, 10:21". */
export function formatRelative(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  const diffMs = nowMs - ms;
  if (diffMs < 60_000) return "hace instantes";
  if (diffMs < 3_600_000) return `hace ${Math.round(diffMs / 60_000)} min`;
  const today = startOfLimaDayMs(nowMs);
  if (ms >= today) return `hace ${Math.round(diffMs / 3_600_000)} h`;
  if (ms >= today - DAY_MS) return `ayer, ${timeFmt.format(ms)}`;
  return `${formatShortDate(ms)}, ${timeFmt.format(ms)}`;
}

/** Compact list time: "10:21" today, "ayer", or "15 oct". */
export function formatListTime(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  const today = startOfLimaDayMs(nowMs);
  if (ms >= today) return timeFmt.format(ms);
  if (ms >= today - DAY_MS) return "ayer";
  return formatShortDate(ms);
}

export function plural(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}
