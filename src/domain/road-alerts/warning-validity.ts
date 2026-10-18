export function warningValidity(
  validFrom: string | null,
  validUntil: string | null,
  nowMs: number,
): "active" | "future" | "expired" | "unknown" {
  if (validFrom === null || validUntil === null || !Number.isFinite(nowMs)) return "unknown";
  const start = Date.parse(validFrom);
  const end = Date.parse(validUntil);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "unknown";
  if (nowMs < start) return "future";
  return nowMs >= end ? "expired" : "active";
}
