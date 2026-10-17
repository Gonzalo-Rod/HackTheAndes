import type { AlertHistoryEntry, RoadAlert } from "@/contracts/road-alerts";
import type { IndeciEntry, NewsEntry, ReportWindow, RunLog, SutranEntry, WeeklyState } from "@/contracts/weekly-incident-report_christian";

// Merges one run's observations into the week's state. Pure and idempotent: merging the same
// observations twice gives the same entries. A source that failed (observation null) leaves
// its entries untouched, so a provider outage never erases what earlier runs collected.

/** Run logs kept per state file; a week of daily runs needs 7, the rest absorbs manual runs. */
export const MAX_RUN_LOGS = 60;

export interface SutranObservation {
  alert: RoadAlert;
  /** Null when the history request failed; the previous history is then kept. */
  history: AlertHistoryEntry[] | null;
}

export type IndeciObservation = Omit<IndeciEntry, "firstSeenAt" | "lastSeenAt">;
export type NewsObservation = Omit<NewsEntry, "firstSeenAt" | "lastSeenAt">;

export interface Observations {
  sutran: SutranObservation[] | null;
  indeci: IndeciObservation[] | null;
  news: NewsObservation[] | null;
}

export function emptyWeeklyState(window: ReportWindow, nowIso: string): WeeklyState {
  return { version: 1, window, updatedAt: nowIso, runs: [], sutran: [], indeci: [], news: [] };
}

function mergeSutran(entries: SutranEntry[], observed: SutranObservation[] | null, nowIso: string): SutranEntry[] {
  if (observed === null) return entries;
  const previous = new Map(entries.map((entry) => [entry.alert.id, entry]));
  const merged = new Map<string, SutranEntry>();
  for (const { alert, history } of observed) {
    const before = previous.get(alert.id);
    merged.set(alert.id, {
      alert,
      history: history ?? before?.history ?? [],
      firstSeenAt: before?.firstSeenAt ?? nowIso,
      lastSeenAt: nowIso,
      listedInLatestRun: true,
    });
  }
  for (const entry of entries) {
    if (!merged.has(entry.alert.id)) merged.set(entry.alert.id, { ...entry, listedInLatestRun: false });
  }
  return [...merged.values()].sort(
    (a, b) => (a.alert.eventDate ?? "").localeCompare(b.alert.eventDate ?? "") || a.alert.code.localeCompare(b.alert.code),
  );
}

function mergeIndeci(entries: IndeciEntry[], observed: IndeciObservation[] | null, nowIso: string): IndeciEntry[] {
  if (observed === null) return entries;
  const merged = new Map(entries.map((entry) => [entry.url, entry]));
  for (const report of observed) {
    const before = merged.get(report.url);
    merged.set(report.url, {
      ...report,
      // Report pages are read once; later runs may skip them and observe no occurrence data.
      occurredDate: report.occurredDate ?? before?.occurredDate ?? null,
      occurredTime: report.occurredTime ?? before?.occurredTime ?? null,
      description: report.description ?? before?.description ?? null,
      firstSeenAt: before?.firstSeenAt ?? nowIso,
      lastSeenAt: nowIso,
    });
  }
  const sortKey = (entry: IndeciEntry) => entry.occurredDate ?? entry.publishedAt ?? "";
  return [...merged.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.url.localeCompare(b.url));
}

function mergeNews(entries: NewsEntry[], observed: NewsObservation[] | null, nowIso: string): NewsEntry[] {
  if (observed === null) return entries;
  const merged = new Map(entries.map((entry) => [entry.key, entry]));
  for (const item of observed) {
    const before = merged.get(item.key);
    merged.set(item.key, {
      ...item,
      // The first listing is kept: Google News may re-list an article with a newer date.
      listedAt: before?.listedAt ?? item.listedAt,
      url: before?.url ?? item.url,
      queries: [...new Set([...(before?.queries ?? []), ...item.queries])].sort(),
      firstSeenAt: before?.firstSeenAt ?? nowIso,
      lastSeenAt: nowIso,
    });
  }
  return [...merged.values()].sort((a, b) => a.listedAt.localeCompare(b.listedAt) || a.key.localeCompare(b.key));
}

export function mergeObservations(state: WeeklyState, observations: Observations, run: RunLog): WeeklyState {
  return {
    ...state,
    updatedAt: run.at,
    runs: [...state.runs, run].slice(-MAX_RUN_LOGS),
    sutran: mergeSutran(state.sutran, observations.sutran, run.at),
    indeci: mergeIndeci(state.indeci, observations.indeci, run.at),
    news: mergeNews(state.news, observations.news, run.at),
  };
}
