import type { AlertCandidate, AlertCheckpoint } from "@/contracts/notifications";
/** Participant policy: evaluate every 30 minutes, only material changes, no quiet hours. */
export const ALERT_INTERVAL_MS = 30 * 60_000;
export const ALERT_LEASE_MS = 90_000;
export const ALERT_BUNDLE_LIMIT = 3;
/** Conservative notification gate for this release; the full confidence model remains pending. */
export const COMMUNITY_ALERT_CONFIDENCE = 0.7;
export function planAlerts(
  candidates: AlertCandidate[],
  previous: AlertCheckpoint,
  range: { startKm: number; endKm: number; isTest: boolean },
  nowMs: number,
) {
  const relevant = candidates.filter(
    (c) => c.startKm <= range.endKm && c.endKm >= range.startKm && Date.parse(c.expiresAt) > nowMs && (!c.isTest || range.isTest),
  );
  const next = { ...previous };
  const changed: AlertCandidate[] = [];
  for (const c of relevant) {
    if (c.level < 0) continue;
    const before = previous[c.key];
    next[c.key] = { fingerprint: c.fingerprint, level: c.level };
    if (c.level < 0 || before?.fingerprint === c.fingerprint) continue;
    if (c.kind === "exposure" ? c.level >= 2 && c.level > (before?.level ?? -1) : before ? true : c.level > 0) changed.push(c);
  }
  // Only checkpoint the selected changes after delivery. Unsent overflow is retained for the next bundle.
  const selected = changed.sort((a, b) => b.level - a.level || a.key.localeCompare(b.key)).slice(0, ALERT_BUNDLE_LIMIT);
  for (const c of changed.slice(ALERT_BUNDLE_LIMIT)) {
    const before = previous[c.key];
    if (before) next[c.key] = before;
    else delete next[c.key];
  }
  return { selected, checkpoint: next };
}
