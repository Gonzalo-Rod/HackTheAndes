// Calendar helpers for America/Lima. Peru has used a fixed UTC−05:00 offset with no
// daylight saving time since 1994, so a constant offset is exact for current data.

export const LIMA_TZ = "America/Lima";
export const LIMA_UTC_OFFSET_MS = -5 * 3_600_000;
export const DAY_MS = 86_400_000;

/** Epoch ms for a Lima calendar date (YYYY-MM-DD) at the given Lima hour. */
export function limaDateToUtcMs(isoDate: string, hour = 12): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour) - LIMA_UTC_OFFSET_MS;
}

/** Lima calendar date (YYYY-MM-DD) for an instant. */
export function limaIsoDate(ms: number): string {
  return new Date(ms + LIMA_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** Epoch ms of 00:00 Lima time on the day containing the instant. */
export function startOfLimaDayMs(ms: number): number {
  return limaDateToUtcMs(limaIsoDate(ms), 0);
}
