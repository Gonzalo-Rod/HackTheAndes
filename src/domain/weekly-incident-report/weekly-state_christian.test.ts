import { describe, expect, it } from "vitest";

import type { RunLog } from "@/contracts/weekly-incident-report_christian";
import {
  INDECI_TITLES,
  realEarlierState,
  realIndeciFeedPage,
  realRoadAlert,
  realRoadAlertHistory,
  realRunLogs,
  WEEK_42,
} from "@/test/fixtures/weekly-report_christian";

import { parseFeedItems } from "./feed-items_christian";
import { parseIndeciReportPage, parseIndeciTitle } from "./indeci-reports_christian";
import {
  emptyWeeklyState,
  type IndeciObservation,
  MAX_RUN_LOGS,
  mergeObservations,
  type NewsObservation,
  type Observations,
  type SutranObservation,
} from "./weekly-state_christian";

// The job's two real runs on 17 Oct 2026, and the news entries they stored.
const [RUN_1, RUN_2] = realRunLogs();
const STORED_NEWS = realEarlierState().news;
const nothing: Observations = { sutran: [], indeci: [], news: [] };
const failedAll: Observations = { sutran: null, indeci: null, news: null };

/** A run in which every source failed (simulated; it carries no data). */
const FAILED_RUN: RunLog = {
  at: RUN_2.at,
  sources: {
    sutran: { ok: false, kept: 0, note: "timeout" },
    indeci: { ok: false, kept: 0, note: "http 503" },
    googleNews: { ok: false, kept: 0, note: "http 429" },
  },
};

function sutran(code: string): SutranObservation {
  const alert = realRoadAlert(code);
  return { alert, history: realRoadAlertHistory(alert) };
}

/** The Canchayllo report as the feed gave it on 17 Oct 2026. */
function canchayllo(): IndeciObservation {
  const item = parseFeedItems(realIndeciFeedPage(3)).find((candidate) => candidate.title === INDECI_TITLES.canchayllo);
  const { hazard, place } = parseIndeciTitle(INDECI_TITLES.canchayllo);
  if (!item || !place) throw new Error("The Canchayllo report is missing from the capture");
  return {
    url: item.link,
    title: item.title,
    hazard,
    place,
    publishedAt: item.publishedAt,
    ...parseIndeciReportPage(item.description ?? ""),
  };
}

/** A news entry stored by the real runs, as one run's observation found by the given queries. */
function storedNews(titleStart: string, queries?: string[]): NewsObservation {
  const entry = STORED_NEWS.find((candidate) => candidate.title.startsWith(titleStart));
  if (!entry) throw new Error(`No stored news entry starts with ${titleStart}`);
  const { key, title, outlet, url, listedAt, placeTerms, incidentTerms } = entry;
  return { key, title, outlet, url, listedAt, placeTerms, incidentTerms, queries: queries ?? entry.queries };
}

describe("mergeObservations", () => {
  it("adds new entries with first and last seen times", () => {
    const state = mergeObservations(
      emptyWeeklyState(WEEK_42, RUN_1.at),
      { sutran: [sutran("SIGEA-171026-01")], indeci: [canchayllo()], news: [storedNews("Choque múltiple")] },
      RUN_1,
    );
    expect(state.sutran).toHaveLength(1);
    expect(state.sutran[0]).toMatchObject({ firstSeenAt: RUN_1.at, lastSeenAt: RUN_1.at, listedInLatestRun: true });
    expect(state.sutran[0].history).toHaveLength(2);
    expect(state.indeci[0]).toMatchObject({ occurredDate: "2026-10-15", occurredTime: "16:00", firstSeenAt: RUN_1.at });
    expect(state.news[0]).toMatchObject({ listedAt: "2026-10-13T15:59:44.000Z", firstSeenAt: RUN_1.at });
    expect(state.updatedAt).toBe(RUN_1.at);
    expect(state.runs).toEqual([RUN_1]);
  });

  it("sorts SUTRAN alerts by event date, then code", () => {
    const observed = ["SIGEA-171026-02", "SIGEA-171026-01", "SIGEA-141026-01"].map(sutran);
    const state = mergeObservations(emptyWeeklyState(WEEK_42, RUN_1.at), { ...nothing, sutran: observed }, RUN_1);
    expect(state.sutran.map((entry) => entry.alert.code)).toEqual(["SIGEA-141026-01", "SIGEA-171026-01", "SIGEA-171026-02"]);
  });

  it("keeps when a listed alert was first seen", () => {
    const first = mergeObservations(emptyWeeklyState(WEEK_42, RUN_1.at), { ...nothing, sutran: [sutran("SIGEA-171026-01")] }, RUN_1);
    const second = mergeObservations(first, { ...nothing, sutran: [sutran("SIGEA-171026-01")] }, RUN_2);
    expect(second.sutran).toHaveLength(1);
    expect(second.sutran[0]).toMatchObject({ firstSeenAt: RUN_1.at, lastSeenAt: RUN_2.at, listedInLatestRun: true });
  });

  it("keeps alerts that a later successful read no longer lists, marked as not listed", () => {
    const first = mergeObservations(emptyWeeklyState(WEEK_42, RUN_1.at), { ...nothing, sutran: [sutran("SIGEA-171026-01")] }, RUN_1);
    const second = mergeObservations(first, nothing, RUN_2);
    expect(second.sutran).toHaveLength(1);
    expect(second.sutran[0]).toMatchObject({ listedInLatestRun: false, lastSeenAt: RUN_1.at });
  });

  it("leaves every entry untouched when the sources failed", () => {
    const first = mergeObservations(
      emptyWeeklyState(WEEK_42, RUN_1.at),
      { sutran: [sutran("SIGEA-171026-01")], indeci: [canchayllo()], news: [storedNews("Choque múltiple")] },
      RUN_1,
    );
    const second = mergeObservations(first, failedAll, FAILED_RUN);
    expect(second.sutran).toEqual(first.sutran);
    expect(second.indeci).toEqual(first.indeci);
    expect(second.news).toEqual(first.news);
    expect(second.runs.at(-1)).toEqual(FAILED_RUN);
  });

  it("keeps the previous history when the history request failed", () => {
    const first = mergeObservations(emptyWeeklyState(WEEK_42, RUN_1.at), { ...nothing, sutran: [sutran("SIGEA-171026-01")] }, RUN_1);
    const failedHistory = { alert: realRoadAlert("SIGEA-171026-01"), history: null };
    const second = mergeObservations(first, { ...nothing, sutran: [failedHistory] }, RUN_2);
    expect(second.sutran[0].history).toEqual(first.sutran[0].history);
  });

  it("keeps INDECI occurrence data read in an earlier run", () => {
    const first = mergeObservations(emptyWeeklyState(WEEK_42, RUN_1.at), { ...nothing, indeci: [canchayllo()] }, RUN_1);
    const unread = { ...canchayllo(), occurredDate: null, occurredTime: null, description: null };
    const second = mergeObservations(first, { ...nothing, indeci: [unread] }, RUN_2);
    expect(second.indeci[0]).toEqual({ ...first.indeci[0], lastSeenAt: RUN_2.at });
  });

  it("merges the queries that found a news item and keeps its first listing", () => {
    const [q1, q2] = storedNews("Choque múltiple").queries;
    const first = mergeObservations(
      emptyWeeklyState(WEEK_42, RUN_1.at),
      { ...nothing, news: [storedNews("Choque múltiple", [q1])] },
      RUN_1,
    );
    const second = mergeObservations(first, { ...nothing, news: [storedNews("Choque múltiple", [q2])] }, RUN_2);
    expect(second.news).toHaveLength(1);
    expect(second.news[0]).toMatchObject({
      listedAt: "2026-10-13T15:59:44.000Z",
      queries: [q1, q2].sort(),
      firstSeenAt: RUN_1.at,
      lastSeenAt: RUN_2.at,
    });
  });

  it("gives the same entries when the same observations are merged twice", () => {
    const observations: Observations = {
      sutran: ["SIGEA-141026-01", "SIGEA-171026-01", "SIGEA-171026-02"].map(sutran),
      indeci: [canchayllo()],
      news: STORED_NEWS.map((entry) => storedNews(entry.title)),
    };
    const once = mergeObservations(emptyWeeklyState(WEEK_42, RUN_1.at), observations, RUN_1);
    const twice = mergeObservations(once, observations, RUN_1);
    expect(twice.sutran).toEqual(once.sutran);
    expect(twice.indeci).toEqual(once.indeci);
    expect(twice.news).toEqual(once.news);
  });

  it("keeps at most MAX_RUN_LOGS run logs", () => {
    // The two real run logs, merged alternately past the cap.
    let state = emptyWeeklyState(WEEK_42, RUN_1.at);
    for (let i = 0; i <= MAX_RUN_LOGS; i++) state = mergeObservations(state, nothing, i % 2 === 0 ? RUN_1 : RUN_2);
    expect(state.runs).toHaveLength(MAX_RUN_LOGS);
    expect(state.runs[0]).toEqual(RUN_2);
    expect(state.runs.at(-1)).toEqual(RUN_1);
  });
});
