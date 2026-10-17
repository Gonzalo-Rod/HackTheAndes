import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseFeedItems } from "@/domain/weekly-incident-report/feed-items_christian";
import { MAX_RETRIES } from "@/integrations/http/fetch-json";
import { realGoogleNewsFeed, realIndeciFeedPage, realIndeciReportPage } from "@/test/fixtures/weekly-report_christian";

import { createIndeciClient } from "./indeci-client_christian";

const noSleep = vi.fn(async () => undefined);
const ctx = { requestId: "test" };
const FEED_URL = "https://portal.indeci.gob.pe/emergencias/feed/";
const SARTIMBAMBA_URL =
  "https://portal.indeci.gob.pe/emergencias/reporte-complementario-n-3325-10-3-2026-coen-indeci-0210-horas-reporte-n-1-deslizamiento-en-el-distrito-de-sartimbamba-la-libertad/";
/** The feed pages captured at 22:13 UTC on 17 Oct 2026, with 3, 3 and 5 of their items. */
const REAL_PAGES = {
  [FEED_URL]: realIndeciFeedPage(1),
  [`${FEED_URL}?paged=2`]: realIndeciFeedPage(2),
  [`${FEED_URL}?paged=3`]: realIndeciFeedPage(3),
};
/** Start of 17 Oct 2026 in Lima; page 3 ends with a report published before it (04:27 UTC). */
const START_OF_17_OCT = Date.parse("2026-10-17T05:00:00Z");
/** Start of the week of 12–18 Oct 2026 in Lima, older than every captured item. */
const START_OF_WEEK_42 = Date.parse("2026-10-12T05:00:00Z");

/** Fetch stand-in that serves bodies or statuses by URL; other URLs answer 404, as WordPress does past the last page. */
function servePages(pages: Record<string, string | number>) {
  return vi.fn(async (url: string | URL | Request) => {
    const body = pages[String(url)];
    if (body === undefined) return new Response("", { status: 404 });
    return typeof body === "number" ? new Response("", { status: body }) : new Response(body);
  });
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  noSleep.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("listReports", () => {
  it("pages back until a page reaches reports published before the start, pausing between pages", async () => {
    const fetchImpl = servePages(REAL_PAGES);
    const listing = await createIndeciClient({ fetchImpl, sleep: noSleep }).listReports(START_OF_17_OCT, ctx);
    expect(listing.complete).toBe(true);
    expect(listing.items).toHaveLength(11);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(noSleep).toHaveBeenCalledTimes(2);
  });

  it("treats a 404 past the last page as the end of a complete listing", async () => {
    const fetchImpl = servePages(REAL_PAGES);
    const listing = await createIndeciClient({ fetchImpl, sleep: noSleep }).listReports(START_OF_WEEK_42, ctx);
    expect(listing.complete).toBe(true);
    expect(listing.items).toHaveLength(11);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("keeps the pages already read when a later page keeps failing", async () => {
    const fetchImpl = servePages({ [FEED_URL]: realIndeciFeedPage(1), [`${FEED_URL}?paged=2`]: 503 });
    const listing = await createIndeciClient({ fetchImpl, sleep: noSleep }).listReports(START_OF_WEEK_42, ctx);
    expect(listing.complete).toBe(false);
    expect(listing.items).toHaveLength(3);
  });

  it("stops at the page cap and reports an incomplete listing", async () => {
    const fetchImpl = servePages(REAL_PAGES);
    const listing = await createIndeciClient({ fetchImpl, sleep: noSleep, maxPages: 2 }).listReports(START_OF_WEEK_42, ctx);
    expect(listing.complete).toBe(false);
    expect(listing.items).toHaveLength(6);
  });

  it("fails when the first page answers 500 or 429 after the retries", async () => {
    for (const status of [500, 429]) {
      const fetchImpl = servePages({ [FEED_URL]: status });
      await expect(createIndeciClient({ fetchImpl, sleep: noSleep }).listReports(START_OF_WEEK_42, ctx)).rejects.toMatchObject({
        kind: "http",
        status,
        provider: "indeci",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(MAX_RETRIES + 1);
    }
  });

  it("fails when the first page times out", async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    await expect(createIndeciClient({ fetchImpl, sleep: noSleep, timeoutMs: 10 }).listReports(START_OF_WEEK_42, ctx)).rejects.toMatchObject(
      {
        kind: "timeout",
      },
    );
  });
});

describe("getReportPage", () => {
  it("reads the occurrence data of an INDECI report page", async () => {
    const fetchImpl = servePages({ [SARTIMBAMBA_URL]: realIndeciReportPage("sartimbamba") });
    await expect(createIndeciClient({ fetchImpl, sleep: noSleep }).getReportPage(SARTIMBAMBA_URL, ctx)).resolves.toMatchObject({
      occurredDate: "2026-03-06",
      occurredTime: "07:30",
    });
  });

  it("refuses URLs outside INDECI's emergency pages without fetching them", async () => {
    const fetchImpl = vi.fn();
    const client = createIndeciClient({ fetchImpl, sleep: noSleep });
    // The guid of a feed item (INDECI's host, outside /emergencias/) and a Google News article link.
    await expect(client.getReportPage("https://portal.indeci.gob.pe/?post_type=alertas&p=319438", ctx)).resolves.toBeNull();
    await expect(client.getReportPage(parseFeedItems(realGoogleNewsFeed(6))[0].link, ctx)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
