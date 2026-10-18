import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReportWindow, WeeklyState } from "@/contracts/weekly-incident-report_christian";
import { parseFeedItems } from "@/domain/weekly-incident-report/feed-items_christian";
import { emptyWeeklyState } from "@/domain/weekly-incident-report/weekly-state_christian";
import type { NewsSearchProvider } from "@/integrations/google-news/google-news-client_christian";
import { UpstreamError } from "@/integrations/http/fetch-json";
import type { EmergencyReportsProvider } from "@/integrations/indeci/indeci-client_christian";
import type { RoadAlertsProvider } from "@/integrations/sutran/sutran-client";
import {
  realEarlierState,
  realGoogleNewsFeed,
  realIndeciCorridorItems,
  realIndeciFeedPage,
  realIndeciSearchFeed,
  realSutranHistory,
  realSutranListing,
  SUTRAN_ALERTS_ENDPOINT,
  WEEK_2020_06,
  WEEK_42,
} from "@/test/fixtures/weekly-report_christian";

import {
  allSourcesFailed,
  createWeeklyIncidentReportService,
  NEWS_QUERIES,
  splitOutlet,
  withCurrentRules,
} from "./weekly-incident-report-service_christian";

/** When the Google News searches were captured. */
const NOW = Date.parse("2026-10-17T22:12:55Z");
const NOW_ISO = new Date(NOW).toISOString();

const timeout = () => new UpstreamError("Sin respuesta en 8 s", "timeout", "test");

/** Provider stand-ins that answer with the real captures of 17 Oct 2026. */
function realProviders() {
  const roadAlerts: RoadAlertsProvider = {
    endpoint: SUTRAN_ALERTS_ENDPOINT,
    listAlerts: vi.fn(async () => realSutranListing()),
    getAlertDetail: vi.fn(),
    getAlertHistory: vi.fn(async (id: string) => realSutranHistory(id)),
  };
  const emergencies: EmergencyReportsProvider = {
    // The captured pages hold part of the week's feed, so the listing is reported as partial.
    listReports: vi.fn(async () => ({
      items: [...([1, 2, 3] as const).map(realIndeciFeedPage), realIndeciCorridorItems()].flatMap((xml) => parseFeedItems(xml)),
      complete: false,
    })),
    getReportPage: vi.fn(async () => {
      throw new UpstreamError("HTTP 503", "http", "indeci", 503);
    }),
  };
  const news: NewsSearchProvider = {
    search: vi.fn(async (query: string) => {
      const queryNumber = (NEWS_QUERIES as readonly string[]).indexOf(query) + 1;
      return parseFeedItems(realGoogleNewsFeed(queryNumber as 1 | 2 | 3 | 4 | 5 | 6));
    }),
  };
  return { roadAlerts, emergencies, news };
}

function update(providers: ReturnType<typeof realProviders>, previous: WeeklyState | ReportWindow = WEEK_42) {
  const state = "version" in previous ? previous : emptyWeeklyState(previous, NOW_ISO);
  return createWeeklyIncidentReportService({ ...providers, now: () => NOW, requestId: "test" }).update(state);
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("weekly incident report service, on the captures of 17 Oct 2026", () => {
  it("keeps the corridor SUTRAN alerts with an event date in the week, with their history", async () => {
    const { state, run } = await update(realProviders());
    // SIGEA-111026-02 and SIGEA-101026-02 are on the corridor too, but from 11 and 10 Oct.
    expect(state.sutran.map((entry) => entry.alert.code)).toEqual(["SIGEA-141026-01", "SIGEA-171026-01", "SIGEA-171026-02"]);
    expect(state.sutran.map((entry) => entry.history.length)).toEqual([2, 2, 1]);
    expect(run.sources.sutran).toEqual({ ok: true, kept: 3, note: null });
  });

  it("keeps no INDECI report, since the week's corridor reports are about fire and wind", async () => {
    const providers = realProviders();
    const { state, run } = await update(providers);
    expect(state.indeci).toEqual([]);
    expect(run.sources.indeci).toEqual({ ok: true, kept: 0, note: "partial feed read" });
    expect(providers.emergencies.getReportPage).not.toHaveBeenCalled();
  });

  it("collects matching news once across queries, inside the week only", async () => {
    const providers = realProviders();
    const { state, run } = await update(providers);
    expect(providers.news.search).toHaveBeenCalledTimes(NEWS_QUERIES.length);
    expect(state.news.map((entry) => [entry.listedAt, entry.outlet, entry.title])).toEqual([
      [
        "2026-10-13T00:58:04.000Z",
        "Diario Ahora",
        "Canal de Huaycoloro, diseñado para huaicos, es usado como basurero en Lurigancho-Chosica",
      ],
      ["2026-10-13T15:59:44.000Z", "Diario Ahora", "Choque múltiple en la Carretera Central deja varios heridos en Concepción"],
      ["2026-10-16T16:18:07.000Z", "Diario Correo", "La Oroya: dos jóvenes resultan heridos tras caer con su auto al río Mantaro"],
    ]);
    expect(state.news[1].queries).toEqual([NEWS_QUERIES[0], NEWS_QUERIES[1], NEWS_QUERIES[5]].sort());
    expect(run.sources.googleNews).toEqual({ ok: true, kept: 3, note: '1 title(s) named only "Carretera Central" and were left out' });
  });

  it("updates the state of the earlier runs and drops what the current rules reject", async () => {
    const earlier = realEarlierState();
    const { state } = await update(realProviders(), earlier);
    expect(state.runs).toHaveLength(3);
    expect(state.sutran.map((entry) => entry.firstSeenAt)).toEqual(earlier.sutran.map((entry) => entry.firstSeenAt));
    expect(state.sutran.every((entry) => entry.lastSeenAt === NOW_ISO)).toBe(true);
    expect(state.news.map((entry) => entry.title)).not.toContain(
      "Dos ocupantes de motocicleta mueren en accidente ocurrido en la Carretera Central",
    );
    expect(state.news).toHaveLength(3);
  });

  it("still keeps an alert whose history request failed", async () => {
    const providers = realProviders();
    providers.roadAlerts.getAlertHistory = vi.fn(async () => {
      throw timeout();
    });
    const { state, run } = await update(providers);
    expect(state.sutran.map((entry) => entry.history)).toEqual([[], [], []]);
    expect(run.sources.sutran.ok).toBe(true);
    expect(run.sources.sutran.note).toBe("3 history request(s) failed; previous history kept");
  });

  it("preserves listed flags and evidence if SUTRAN rejects records after a schema change", async () => {
    const earlier = realEarlierState();
    const providers = realProviders();
    // Simulates schema rejection, carrying no invented incident data.
    providers.roadAlerts.listAlerts = vi.fn(async () => ({ records: [], invalidCount: realSutranListing().records.length }));
    const { state, run } = await update(providers, earlier);
    expect(run.sources.sutran).toEqual({ ok: false, kept: 0, note: "invalid_body" });
    expect(state.sutran).toEqual(earlier.sutran);
    expect(state.news).toHaveLength(3);
  });

  it("records a failed source and still updates the others", async () => {
    const providers = realProviders();
    providers.emergencies.listReports = vi.fn(async () => {
      throw new UpstreamError("HTTP 503", "http", "indeci", 503);
    });
    const { state, run } = await update(providers);
    expect(run.sources.indeci).toEqual({ ok: false, kept: 0, note: "http 503" });
    expect(state.sutran).toHaveLength(3);
    expect(state.news).toHaveLength(3);
    expect(allSourcesFailed(run)).toBe(false);
  });

  it("notes failed searches next to the left-out titles", async () => {
    const providers = realProviders();
    const answer = providers.news.search;
    providers.news.search = vi
      .fn()
      .mockRejectedValueOnce(new UpstreamError("HTTP 429", "http", "google-news", 429))
      .mockImplementation(answer);
    const { state, run } = await update(providers);
    // Without the first query, two others still find the Concepción crash.
    expect(state.news[1].queries).toEqual([NEWS_QUERIES[1], NEWS_QUERIES[5]].sort());
    expect(run.sources.googleNews.note).toBe(
      `1 of ${NEWS_QUERIES.length} searches failed; 1 title(s) named only "Carretera Central" and were left out`,
    );
  });

  it("flags a run where every source failed", async () => {
    const failing = async () => {
      throw timeout();
    };
    const providers = realProviders();
    providers.roadAlerts.listAlerts = vi.fn(failing);
    providers.emergencies.listReports = vi.fn(failing);
    providers.news.search = vi.fn(failing);
    const { run } = await update(providers);
    expect(run.sources).toEqual({
      sutran: { ok: false, kept: 0, note: "timeout" },
      indeci: { ok: false, kept: 0, note: "timeout" },
      googleNews: { ok: false, kept: 0, note: "timeout" },
    });
    expect(allSourcesFailed(run)).toBe(true);
  });
});

describe("weekly incident report service, on INDECI's 2020 Lurigancho-Chosica huaico report", () => {
  it("keeps a corridor huaico report by its publication when its page cannot be read", async () => {
    const providers = realProviders();
    providers.emergencies.listReports = vi.fn(async () => ({ items: parseFeedItems(realIndeciSearchFeed()), complete: false }));
    const { state, run } = await update(providers, WEEK_2020_06);
    expect(state.indeci).toEqual([
      expect.objectContaining({
        hazard: "Huaico",
        place: { level: "distrito", names: ["Lurigancho Chosica"], department: "Lima" },
        publishedAt: "2020-02-07T00:52:35.000Z",
        occurredDate: null,
        occurredTime: null,
        description: null,
      }),
    ]);
    // The feed description uses INDECI's older format, without the occurrence table, so the page was tried.
    expect(providers.emergencies.getReportPage).toHaveBeenCalledTimes(1);
    expect(run.sources.indeci).toEqual({ ok: true, kept: 1, note: "partial feed read" });
    // The 2026 SUTRAN and Google News captures have nothing in that week.
    expect(state.sutran).toEqual([]);
    expect(state.news).toEqual([]);
  });
});

describe("withCurrentRules", () => {
  it("drops the stored title that names only 'Carretera Central'", () => {
    const earlier = realEarlierState();
    const cleaned = withCurrentRules(earlier);
    expect(earlier.news).toHaveLength(4);
    expect(cleaned.news.map((entry) => entry.title)).toEqual([
      "Canal de Huaycoloro, diseñado para huaicos, es usado como basurero en Lurigancho-Chosica",
      "Choque múltiple en la Carretera Central deja varios heridos en Concepción",
      "La Oroya: dos jóvenes resultan heridos tras caer con su auto al río Mantaro",
    ]);
    expect(cleaned.sutran).toEqual(earlier.sutran);
  });
});

describe("splitOutlet", () => {
  it("removes the outlet suffix that Google News adds to titles", () => {
    const [item] = parseFeedItems(realGoogleNewsFeed(6));
    expect(splitOutlet(item)).toEqual({
      headline: "Choque múltiple en la Carretera Central deja varios heridos en Concepción",
      outlet: "Diario Ahora",
    });
  });
});
