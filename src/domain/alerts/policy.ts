import type { AlertCandidate, AlertCheckpoint } from "@/contracts/notifications";
/** Evaluate on source changes; durable fingerprints suppress repeats without a delivery cooldown. */
export const ALERT_LEASE_MS = 90_000;
export const ALERT_BUNDLE_LIMIT = 3;
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
  // Reported events take priority. All changed climate segments share one short notice;
  // otherwise a corridor-wide assessment would postpone new reports behind many segments.
  const ordered = changed.sort((a, b) => b.level - a.level || a.key.localeCompare(b.key));
  const reported = ordered.filter((candidate) => candidate.kind !== "exposure");
  const selected = reported.length ? reported.slice(0, ALERT_BUNDLE_LIMIT) : ordered;
  const selectedKeys = new Set(selected.map((candidate) => candidate.key));
  for (const candidate of changed) {
    if (selectedKeys.has(candidate.key)) continue;
    const before = previous[candidate.key];
    if (before) next[candidate.key] = before;
    else delete next[candidate.key];
  }
  return { selected, checkpoint: next };
}

export function isCommunityAlertEligible(incident: { isTest: boolean; isTeam: boolean; status: string }) {
  return incident.status === "active" && (incident.isTest || !incident.isTeam);
}
