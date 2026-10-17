import { type FeedItem, parseFeedItems } from "@/domain/weekly-incident-report/feed-items_christian";
import { type IndeciReportPage, parseIndeciReportPage } from "@/domain/weekly-incident-report/indeci-reports_christian";
import { type RequestOptions, UpstreamError } from "@/integrations/http/fetch-json";
import { getText } from "@/integrations/http/get-text_christian";
import { logger } from "@/lib/logger";

// INDECI's COEN emergency reports, read from the WordPress feed of portal.indeci.gob.pe
// (/emergencias/feed/, newest first, paged with ?paged=N) and from each report's page, which
// states the date and time of the event. No authentication; requests are paced.

const PROVIDER = "indeci";
const FEED_URL = "https://portal.indeci.gob.pe/emergencias/feed/";
const REPORT_HOST = "portal.indeci.gob.pe";
/** Feed pages read at most. On 2026-10-17 each page listed 14 reports and 33 pages reached back 7.5 days. */
export const MAX_FEED_PAGES = 50;
/** Pause between feed pages, to keep the load on INDECI's site low. */
const PAGE_DELAY_MS = 300;
/** Report pages and later feed pages are secondary; one retry bounds a run's latency. */
const SECONDARY_RETRIES = 1;

export interface CallContext {
  requestId?: string;
}

export interface ReportListing {
  items: FeedItem[];
  /** False when paging stopped early because a later page failed. */
  complete: boolean;
}

/** Source of official emergency reports. Implemented by INDECI; replaceable by a fake in tests. */
export interface EmergencyReportsProvider {
  /** Reports published at or after `sinceMs`, newest first. */
  listReports(sinceMs: number, ctx: CallContext): Promise<ReportListing>;
  /** Occurrence date, time and description from a report page; null for URLs outside INDECI's site. */
  getReportPage(url: string, ctx: CallContext): Promise<IndeciReportPage | null>;
}

interface IndeciClientOptions {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxPages?: number;
  /** Per-attempt timeout; the shared wrapper's default when omitted. */
  timeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isIndeciReportUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const parsed = new URL(url);
  return parsed.protocol === "https:" && parsed.hostname === REPORT_HOST && parsed.pathname.startsWith("/emergencias/");
}

export function createIndeciClient({
  fetchImpl,
  sleep = defaultSleep,
  maxPages = MAX_FEED_PAGES,
  timeoutMs,
}: IndeciClientOptions = {}): EmergencyReportsProvider {
  const request = (url: string, operation: string, ctx: CallContext, retries?: number) => {
    const options: RequestOptions = { provider: PROVIDER, operation, requestId: ctx.requestId, fetchImpl, sleep, retries, timeoutMs };
    return getText(url, options);
  };

  return {
    async listReports(sinceMs, ctx) {
      const items: FeedItem[] = [];
      for (let page = 1; page <= maxPages; page++) {
        if (page > 1) await sleep(PAGE_DELAY_MS);
        const url = page === 1 ? FEED_URL : `${FEED_URL}?paged=${page}`;
        let pageItems: FeedItem[];
        try {
          pageItems = parseFeedItems(await request(url, "indeci.feed.page", ctx, page === 1 ? undefined : SECONDARY_RETRIES));
        } catch (error) {
          // Past the last page the feed answers 404 (checked with ?paged=999999 on 2026-10-17).
          // Any other failure after page 1 keeps the pages already read.
          if (page > 1 && error instanceof UpstreamError && error.status === 404) return { items, complete: true };
          if (page === 1) throw error;
          logger.warn({ operation: "indeci.feed.page", provider: PROVIDER, requestId: ctx.requestId, result: "skipped", page });
          return { items, complete: false };
        }
        items.push(...pageItems);
        const oldest = pageItems.reduce<number>((min, item) => {
          const ms = item.publishedAt ? Date.parse(item.publishedAt) : Number.POSITIVE_INFINITY;
          return Math.min(min, ms);
        }, Number.POSITIVE_INFINITY);
        if (pageItems.length === 0 || oldest < sinceMs) return { items, complete: true };
      }
      // The page cap was reached before the window start: the listing may miss the oldest reports.
      return { items, complete: false };
    },

    async getReportPage(url, ctx) {
      if (!isIndeciReportUrl(url)) return null;
      return parseIndeciReportPage(await request(url, "indeci.report.page", ctx, SECONDARY_RETRIES));
    },
  };
}
