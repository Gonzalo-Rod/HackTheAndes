import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_RETRIES, UpstreamError } from "@/integrations/http/fetch-json";
import { realGoogleNewsFeed } from "@/test/fixtures/weekly-report_christian";

import { createGoogleNewsClient, googleNewsSearchUrl } from "./google-news-client_christian";

const noSleep = vi.fn(async () => undefined);
const ctx = { requestId: "test" };
const xmlResponse = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "application/xml" } });
/** The sixth report query and Google's real answer to it. */
const QUERY = '"Carretera Central" (Jauja OR Concepción OR Huancayo) when:7d';
const FEED = realGoogleNewsFeed(6);

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  noSleep.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("googleNewsSearchUrl", () => {
  it("searches the Peru edition in Latin American Spanish and encodes the query", () => {
    const url = new URL(googleNewsSearchUrl(QUERY));
    expect(url.origin + url.pathname).toBe("https://news.google.com/rss/search");
    expect(url.searchParams.get("q")).toBe(QUERY);
    expect(url.searchParams.get("hl")).toBe("es-419");
    expect(url.searchParams.get("gl")).toBe("PE");
    expect(url.searchParams.get("ceid")).toBe("PE:es-419");
  });
});

describe("createGoogleNewsClient", () => {
  it("parses the feed and identifies the job with its user agent", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => xmlResponse(FEED));
    const items = await createGoogleNewsClient({ fetchImpl, sleep: noSleep }).search(QUERY, ctx);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      title: "Choque múltiple en la Carretera Central deja varios heridos en Concepción - Diario Ahora",
      sourceName: "Diario Ahora",
    });
    expect(String(fetchImpl.mock.calls[0][0])).toBe(googleNewsSearchUrl(QUERY));
    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers);
    expect(headers.get("User-Agent")).toBe("PeruRoadClimate-weekly-report/1.0");
  });

  it("retries a 500 and then returns the feed", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(xmlResponse("", 500)).mockResolvedValueOnce(xmlResponse(FEED));
    await expect(createGoogleNewsClient({ fetchImpl, sleep: noSleep }).search(QUERY, ctx)).resolves.toHaveLength(4);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated 429 responses", async () => {
    const fetchImpl = vi.fn(async () => xmlResponse("", 429));
    const error = await createGoogleNewsClient({ fetchImpl, sleep: noSleep })
      .search(QUERY, ctx)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect(error).toMatchObject({ kind: "http", status: 429, provider: "google-news" });
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it("reports a timeout", async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    await expect(createGoogleNewsClient({ fetchImpl, sleep: noSleep, timeoutMs: 10 }).search(QUERY, ctx)).rejects.toMatchObject({
      kind: "timeout",
    });
  });
});
