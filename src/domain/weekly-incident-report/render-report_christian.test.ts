import { describe, expect, it } from "vitest";

import { type ReportWindow, type RunLog, WeeklyStateSchema } from "@/contracts/weekly-incident-report_christian";
import {
  realGoogleNewsChosicaFeed,
  realIndeciSearchFeed,
  realRoadAlert,
  realRoadAlertHistory,
  realRunLogs,
  SUTRAN_ALERTS_ENDPOINT,
  WEEK_2020_06,
  WEEK_42,
} from "@/test/fixtures/weekly-report_christian";

import { matchNewsTitle, placeKey } from "./corridor_christian";
import { parseFeedItems } from "./feed-items_christian";
import { parseIndeciTitle } from "./indeci-reports_christian";
import { formatLimaDateTime, renderWeeklyReport } from "./render-report_christian";
import { emptyWeeklyState, mergeObservations, type Observations } from "./weekly-state_christian";

// The job's second real run on 17 Oct 2026.
const [, RUN] = realRunLogs();
// With a trailing slash, which the renderer trims.
const options = { sutranAlertsEndpoint: `${SUTRAN_ALERTS_ENDPOINT}/` };

const corridorAlerts = () =>
  ["SIGEA-141026-01", "SIGEA-171026-01", "SIGEA-171026-02"].map((code) => {
    const alert = realRoadAlert(code);
    return { alert, history: realRoadAlertHistory(alert) };
  });

function stateWith(observations: Partial<Observations>, window: ReportWindow = WEEK_42, run: RunLog = RUN) {
  return mergeObservations(emptyWeeklyState(window, run.at), { sutran: [], indeci: [], news: [], ...observations }, run);
}

describe("renderWeeklyReport", () => {
  it("renders the window and the latest run's source status", () => {
    const markdown = renderWeeklyReport(stateWith({ sutran: corridorAlerts() }), options);
    expect(markdown).toContain("# Carretera Central (PE-22) road incidents, 12–18 October 2026");
    expect(markdown).toContain("- **Sources in the latest run:** SUTRAN: ok, 3 kept; INDECI: ok, 0 kept; Google News: ok, 4 kept.");
  });

  it("renders each SUTRAN alert with its place, status, history, link and validity", () => {
    const markdown = renderWeeklyReport(stateWith({ sutran: corridorAlerts() }), options);
    expect(markdown).toContain("PE-22 KM 51, Santa Cruz de Cocachacra (Huarochiri, Lima); direction Norte → Sur");
    expect(markdown).toContain("17 Oct 2026, 10:21 published; 17 Oct 2026, 14:36 set to `normal`");
    expect(markdown).toContain(
      "[SUTRAN SIGEA-171026-01](https://api.sigea.sutran.gob.pe/public/alerts/3e20237e-1aca-4f6a-879f-95333e74b131), reported by CONCESIONARIA DEVIANDES",
    );
    expect(markdown).toContain("Yes, valid until 17 Oct 2026");
    expect(markdown).toContain('Restricted (`restringido`): "Via restringida"');
  });

  it("adds SUTRAN's description to the title only when it says more", () => {
    const markdown = renderWeeklyReport(stateWith({ sutran: corridorAlerts() }), options);
    expect(markdown).toContain(
      "| Accident: Accidente KM 06. Accidente de un vehiculode de carga pesada con posterior despiste y volcadura |",
    );
    expect(markdown).toContain("| Accident: KM 51 - despiste y volcadura de una carreta de un tráiler |");
  });

  it("writes 'no indicado' for a missing field", () => {
    // The history request failed and no earlier run had read it.
    const markdown = renderWeeklyReport(stateWith({ sutran: [{ alert: realRoadAlert("SIGEA-171026-02"), history: null }] }), options);
    expect(markdown).toContain('| Restricted (`restringido`): "Via restringida" | no indicado |');
  });

  it("keeps an INDECI report without an event date in the separate unconfirmed section", () => {
    const [item] = parseFeedItems(realIndeciSearchFeed());
    const { hazard, place } = parseIndeciTitle(item.title);
    if (!place) throw new Error("The 2020 report has no place");
    const report = { url: item.link, title: item.title, hazard, place, publishedAt: item.publishedAt };
    const unread = { ...report, occurredDate: null, occurredTime: null, description: null };
    const markdown = renderWeeklyReport(stateWith({ indeci: [unread] }, WEEK_2020_06), options);
    const [dated, undated] = markdown.split("## INDECI reports to review: event date unconfirmed");
    expect(dated).not.toContain(item.link);
    expect(undated).toContain(item.link);
    expect(undated).toContain("Publication does not confirm");
    expect(markdown).toContain(
      `| 1 | no indicado (published 6 Feb 2020, 19:52) | District of Lurigancho Chosica (Lima) | Huaico | no indicado | [INDECI COEN](${item.link}) |`,
    );
  });

  it("escapes pipes and shortens long titles in news rows", () => {
    const [item] = parseFeedItems(realGoogleNewsChosicaFeed());
    const title = item.title.replace(/ - Facebook$/, "");
    const match = matchNewsTitle(title);
    if (!match || !item.publishedAt) throw new Error("The Chosica item no longer matches");
    const news = { key: `${placeKey(title)}|FACEBOOK`, title, outlet: "Facebook", url: item.link, listedAt: item.publishedAt, ...match };
    const markdown = renderWeeklyReport(stateWith({ news: [{ ...news, queries: ["Chosica when:7d"] }] }), options);
    expect(markdown).toContain("| 1 | 16 Oct 2026, 11:24 | 🔴🔵 #HablemosClaro💬💬 \\| Una maquinaria chocó contra un puente en Chosica");
    expect(markdown).toContain(`… | Facebook | chosica, rimac, choco | [link](${item.link}) |`);
  });

  it("explains empty sections instead of rendering empty tables", () => {
    const markdown = renderWeeklyReport(emptyWeeklyState(WEEK_42, RUN.at), options);
    expect(markdown).toContain("No SUTRAN alert on the corridor has an event date in this week.");
    expect(markdown).toContain("No INDECI emergency report in a corridor district with a road-related hazard this week.");
    expect(markdown).toContain("No news title matched the corridor and an incident term this week.");
    expect(markdown).toContain("- **Sources in the latest run:** no run yet.");
  });

  it("shows failed sources with their error types", () => {
    // Simulated failures; they carry no data.
    const failedRun: RunLog = {
      at: RUN.at,
      sources: {
        sutran: { ok: false, kept: 0, note: "timeout" },
        indeci: { ok: false, kept: 0, note: "http 503" },
        googleNews: { ok: false, kept: 0, note: "http 429" },
      },
    };
    const state = mergeObservations(emptyWeeklyState(WEEK_42, RUN.at), { sutran: null, indeci: null, news: null }, failedRun);
    expect(renderWeeklyReport(state, options)).toContain(
      "SUTRAN: failed (timeout); INDECI: failed (http 503); Google News: failed (http 429)",
    );
    const cached = stateWith({ sutran: corridorAlerts() });
    const afterFailure = mergeObservations(cached, { sutran: null, indeci: null, news: null }, failedRun);
    const markdown = renderWeeklyReport(afterFailure, options);
    expect(markdown).toContain("Unavailable; retained observation from");
    expect(markdown).not.toContain("Yes, valid until");
  });

  it("produces state that still matches the schema", () => {
    expect(WeeklyStateSchema.safeParse(stateWith({ sutran: corridorAlerts() })).success).toBe(true);
  });
});

describe("formatLimaDateTime", () => {
  it("shows Lima time", () => {
    // SUTRAN published SIGEA-171026-02 at 20:12 UTC.
    expect(formatLimaDateTime("2026-10-17T20:12:02.393Z")).toBe("17 Oct 2026, 15:12");
    expect(formatLimaDateTime("2026-10-19T04:59:00.000Z")).toBe("18 Oct 2026, 23:59");
  });

  it("writes 'no indicado' for missing or non-ISO times", () => {
    expect(formatLimaDateTime(null)).toBe("no indicado");
    // SUTRAN's fechaEvento format.
    expect(formatLimaDateTime("17/10/2026")).toBe("no indicado");
  });
});
