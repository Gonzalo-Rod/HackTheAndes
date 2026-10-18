import type { AlertHistoryEntry } from "@/contracts/road-alerts";
import type { IndeciEntry, ReportWindow, RunLog, SourceRun, WeeklyState } from "@/contracts/weekly-incident-report_christian";
import { normalizeSutranAlert, normalizeSutranHistory } from "@/domain/road-alerts/normalize";
import {
  classifyNewsTitle,
  isCorridorAlert,
  isCorridorPlace,
  isRoadRelevantHazard,
  matchNewsTitle,
  placeKey,
} from "@/domain/weekly-incident-report/corridor_christian";
import type { FeedItem } from "@/domain/weekly-incident-report/feed-items_christian";
import {
  type IndeciReportPage,
  isReportInWeek,
  parseIndeciReportPage,
  parseIndeciTitle,
} from "@/domain/weekly-incident-report/indeci-reports_christian";
import { isDateInWindow, windowEndMs, windowStartMs } from "@/domain/weekly-incident-report/week-window_christian";
import {
  type IndeciObservation,
  mergeObservations,
  type NewsObservation,
  type SutranObservation,
} from "@/domain/weekly-incident-report/weekly-state_christian";
import { UpstreamError } from "@/integrations/http/fetch-json";
import type { NewsSearchProvider } from "@/integrations/google-news/google-news-client_christian";
import type { EmergencyReportsProvider } from "@/integrations/indeci/indeci-client_christian";
import type { RoadAlertsProvider } from "@/integrations/sutran/sutran-client";
import { logger } from "@/lib/logger";
import { DAY_MS, limaIsoDate } from "@/lib/time";

// Use case: update one week of the Carretera Central incident report. Official alerts and
// emergency reports (SUTRAN, INDECI) are collected as reported; news titles (Google News)
// are collected for human review. Each source fails on its own and the failure is recorded in
// the run log, so one provider outage never blocks the others.

/** Google News queries; `when:7d` limits each to items listed in the last seven days. */
export const NEWS_QUERIES = [
  '"Carretera Central" when:7d',
  '"Carretera Central" (accidente OR choque OR despiste OR volcadura) when:7d',
  '"Carretera Central" (huaico OR derrumbe OR deslizamiento OR "caída de rocas") when:7d',
  '"Carretera Central" (bloqueo OR paro OR cierre OR restringido OR interrumpido) when:7d',
  '(Chosica OR Matucana OR Ticlio OR "La Oroya" OR Huarochirí) (accidente OR huaico OR derrumbe OR bloqueo) when:7d',
  '"Carretera Central" (Jauja OR Concepción OR Huancayo) when:7d',
] as const;

/**
 * Days after the week in which INDECI reports still count. INDECI publishes some reports days
 * after the event: the San Juan de Lurigancho fire of 14 Oct 2026, 15:48 was reported on 16 Oct, 07:40.
 */
const INDECI_LATE_REPORT_DAYS = 2;
/**
 * Report pages opened per run when a feed description lacks the occurrence table. A safety cap:
 * of 364 reports published 12–17 Oct 2026, 3 were in corridor districts, all with the table in the feed.
 */
const MAX_INDECI_PAGES_PER_RUN = 25;

export interface WeeklyIncidentReportDeps {
  roadAlerts: RoadAlertsProvider;
  emergencies: EmergencyReportsProvider;
  news: NewsSearchProvider;
  now: () => number;
  requestId?: string;
}

interface SourceResult<T> {
  observed: T[] | null;
  run: SourceRun;
}

/** Short, non-sensitive description of a failure for the run log. */
function failureNote(error: unknown): string {
  if (error instanceof UpstreamError) return error.status ? `${error.kind} ${error.status}` : error.kind;
  return "unexpected error";
}

const failed = <T>(error: unknown): SourceResult<T> => ({ observed: null, run: { ok: false, kept: 0, note: failureNote(error) } });

async function collectSutran(deps: WeeklyIncidentReportDeps, window: ReportWindow): Promise<SourceResult<SutranObservation>> {
  const ctx = { requestId: deps.requestId };
  try {
    const { records, invalidCount } = await deps.roadAlerts.listAlerts(ctx);
    // A partial schema failure cannot prove that previously seen alerts disappeared.
    if (invalidCount > 0) throw new UpstreamError("Incomplete SUTRAN listing", "invalid_body", "sutran");
    const alerts = records
      .map(normalizeSutranAlert)
      .filter((alert) => alert !== null)
      .filter((alert) => isCorridorAlert(alert) && alert.eventDate !== null && isDateInWindow(window, alert.eventDate));

    const observed: SutranObservation[] = [];
    let missingHistory = 0;
    for (const alert of alerts) {
      let history: AlertHistoryEntry[] | null = null;
      try {
        history = normalizeSutranHistory(await deps.roadAlerts.getAlertHistory(alert.id, ctx));
      } catch (error) {
        missingHistory++;
        // The alert is still reported; its previous history (if any) is kept by the merge.
        logger.warn({
          operation: "weekly_report.sutran.history",
          provider: "sutran",
          requestId: deps.requestId,
          result: "skipped",
          errorType: failureNote(error),
        });
      }
      observed.push({ alert, history });
    }
    return {
      observed,
      run: {
        ok: true,
        kept: observed.length,
        note: missingHistory ? `${missingHistory} history request(s) failed; previous history kept` : null,
      },
    };
  } catch (error) {
    return failed(error);
  }
}

async function collectIndeci(deps: WeeklyIncidentReportDeps, state: WeeklyState): Promise<SourceResult<IndeciObservation>> {
  const ctx = { requestId: deps.requestId };
  const startMs = windowStartMs(state.window);
  const endMs = windowEndMs(state.window);
  const lateEndMs = endMs + INDECI_LATE_REPORT_DAYS * DAY_MS;
  const known = new Map<string, IndeciEntry>(state.indeci.map((entry) => [entry.url, entry]));

  try {
    const listing = await deps.emergencies.listReports(startMs, ctx);
    const observed = new Map<string, IndeciObservation>();
    let pagesRead = 0;

    for (const item of listing.items) {
      const publishedMs = item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN;
      if (!(publishedMs >= startMs && publishedMs < lateEndMs) || observed.has(item.link)) continue;
      const { hazard, place } = parseIndeciTitle(item.title);
      if (!place || !isCorridorPlace(place) || !isRoadRelevantHazard(hazard)) continue;

      // The feed description usually carries the occurrence table; the report page is the fallback.
      const before = known.get(item.link);
      let page: IndeciReportPage | null = item.description ? parseIndeciReportPage(item.description) : null;
      if (!page?.occurredDate && before?.occurredDate) {
        page = { occurredDate: before.occurredDate, occurredTime: before.occurredTime, description: before.description };
      }
      if (!page?.occurredDate && pagesRead < MAX_INDECI_PAGES_PER_RUN) {
        pagesRead++;
        try {
          page = (await deps.emergencies.getReportPage(item.link, ctx)) ?? page;
        } catch (error) {
          logger.warn({
            operation: "weekly_report.indeci.page",
            provider: "indeci",
            requestId: deps.requestId,
            result: "skipped",
            errorType: failureNote(error),
          });
        }
      }

      const occurredDate = page?.occurredDate ?? null;
      if (!isReportInWeek(state.window, { occurredDate, publishedAt: item.publishedAt })) continue;
      observed.set(item.link, {
        url: item.link,
        title: item.title,
        hazard,
        place,
        publishedAt: item.publishedAt,
        occurredDate,
        occurredTime: page?.occurredTime ?? null,
        description: page?.description ?? null,
      });
    }
    const note = listing.complete ? null : "partial feed read";
    return { observed: [...observed.values()], run: { ok: true, kept: observed.size, note } };
  } catch (error) {
    return failed(error);
  }
}

/** Google News titles end in " - <outlet>"; the outlet also comes in <source>. */
export function splitOutlet(item: Pick<FeedItem, "title" | "sourceName">): { headline: string; outlet: string | null } {
  const suffix = item.sourceName ? ` - ${item.sourceName}` : null;
  if (suffix && item.title.endsWith(suffix)) return { headline: item.title.slice(0, -suffix.length).trim(), outlet: item.sourceName };
  return { headline: item.title, outlet: item.sourceName };
}

async function collectNews(deps: WeeklyIncidentReportDeps, window: ReportWindow): Promise<SourceResult<NewsObservation>> {
  const ctx = { requestId: deps.requestId };
  const observed = new Map<string, NewsObservation>();
  const roadNameOnly = new Set<string>();
  let failures = 0;
  let lastError: unknown = null;

  for (const query of NEWS_QUERIES) {
    let items: FeedItem[];
    try {
      items = await deps.news.search(query, ctx);
    } catch (error) {
      failures++;
      lastError = error;
      continue;
    }
    for (const item of items) {
      if (!item.publishedAt || !isDateInWindow(window, limaIsoDate(Date.parse(item.publishedAt)))) continue;
      const { headline, outlet } = splitOutlet(item);
      const key = `${placeKey(headline)}|${placeKey(outlet ?? "")}`;
      const check = classifyNewsTitle(headline);
      if (check.kind === "road-name-only") roadNameOnly.add(key);
      if (check.kind !== "match") continue;
      const { match } = check;
      const existing = observed.get(key);
      if (existing) {
        if (!existing.queries.includes(query)) existing.queries.push(query);
        continue;
      }
      observed.set(key, { key, title: headline, outlet, url: item.link, listedAt: item.publishedAt, ...match, queries: [query] });
    }
  }

  if (failures === NEWS_QUERIES.length) return failed(lastError);
  const notes = [
    failures > 0 ? `${failures} of ${NEWS_QUERIES.length} searches failed` : null,
    roadNameOnly.size > 0 ? `${roadNameOnly.size} title(s) named only "Carretera Central" and were left out` : null,
  ].filter((note) => note !== null);
  return { observed: [...observed.values()], run: { ok: true, kept: observed.size, note: notes.join("; ") || null } };
}

/** Drops stored entries that the current corridor and matching rules no longer accept, so rule changes apply to past runs too. */
export function withCurrentRules(state: WeeklyState): WeeklyState {
  return {
    ...state,
    sutran: state.sutran.filter((entry) => isCorridorAlert(entry.alert)),
    indeci: state.indeci.filter((entry) => isCorridorPlace(entry.place) && isRoadRelevantHazard(entry.hazard)),
    news: state.news.filter((entry) => matchNewsTitle(entry.title) !== null),
  };
}

export function createWeeklyIncidentReportService(deps: WeeklyIncidentReportDeps) {
  return {
    /** Collects every source once and merges the results into the week's state. */
    async update(previous: WeeklyState): Promise<{ state: WeeklyState; run: RunLog }> {
      const state = withCurrentRules(previous);
      const [sutran, indeci, news] = await Promise.all([
        collectSutran(deps, state.window),
        collectIndeci(deps, state),
        collectNews(deps, state.window),
      ]);
      const run: RunLog = {
        at: new Date(deps.now()).toISOString(),
        sources: { sutran: sutran.run, indeci: indeci.run, googleNews: news.run },
      };
      for (const [provider, source] of Object.entries(run.sources)) {
        if (!source.ok || source.note)
          logger.warn({
            operation: "weekly_report.source",
            provider,
            requestId: deps.requestId,
            result: source.ok ? "skipped" : "error",
            note: source.note,
          });
      }
      const merged = mergeObservations(state, { sutran: sutran.observed, indeci: indeci.observed, news: news.observed }, run);
      return { state: merged, run };
    },
  };
}

/** True when no source answered in the run, so the state file should not be rewritten. */
export function allSourcesFailed(run: RunLog): boolean {
  return Object.values(run.sources).every((source) => !source.ok);
}
