import { type FeedItem, parseFeedItems } from "@/domain/weekly-incident-report/feed-items_christian";
import type { RequestOptions } from "@/integrations/http/fetch-json";
import { getText } from "@/integrations/http/get-text_christian";

// Google News RSS search: each request returns items from many outlets with their listing
// dates (the report's six queries returned 1–22 items each on 2026-10-17). It is a public feed
// without an API key or documented terms, so the report treats it as discovery, never as
// confirmation: listing dates can belong to older articles (an article of 14 Sep 2026 was
// listed on 16 Oct).

const PROVIDER = "google-news";
const SEARCH_URL = "https://news.google.com/rss/search";
/** Peru edition in Latin American Spanish. */
const EDITION = { hl: "es-419", gl: "PE", ceid: "PE:es-419" } as const;
/** Identifies the job to the feed's operator. */
const USER_AGENT = "PeruRoadClimate-weekly-report/1.0";

export interface CallContext {
  requestId?: string;
}

/** Source of news items for a search query. Implemented by Google News; replaceable by a fake in tests. */
export interface NewsSearchProvider {
  search(query: string, ctx: CallContext): Promise<FeedItem[]>;
}

interface GoogleNewsClientOptions {
  fetchImpl?: typeof fetch;
  sleep?: RequestOptions["sleep"];
  /** Per-attempt timeout; the shared wrapper's default when omitted. */
  timeoutMs?: number;
}

export function googleNewsSearchUrl(query: string): string {
  return `${SEARCH_URL}?${new URLSearchParams({ q: query, ...EDITION }).toString()}`;
}

export function createGoogleNewsClient({ fetchImpl, sleep, timeoutMs }: GoogleNewsClientOptions = {}): NewsSearchProvider {
  return {
    async search(query, ctx) {
      const xml = await getText(googleNewsSearchUrl(query), {
        provider: PROVIDER,
        operation: "google_news.search",
        requestId: ctx.requestId,
        headers: { "User-Agent": USER_AGENT },
        fetchImpl,
        sleep,
        timeoutMs,
      });
      return parseFeedItems(xml);
    },
  };
}
