import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import type { RoadAlert } from "@/contracts/road-alerts";
import { type RunLog, type WeeklyState, WeeklyStateSchema } from "@/contracts/weekly-incident-report_christian";
import {
  normalizeSutranAlert,
  normalizeSutranHistory,
  type SutranAlertRecord,
  type SutranHistoryRecord,
} from "@/domain/road-alerts/normalize";
import { envelope, parseEach, SutranAlertRecordSchema, SutranHistoryRecordSchema } from "@/integrations/sutran/schemas";

// Real captures for the weekly incident report tests (see weekly-report-real_christian/README_christian.md).
// Strings below are copied verbatim from those captures or from the public pages cited next to them.

const DIR = path.join(import.meta.dirname, "weekly-report-real_christian");

export function readFixture(name: string): string {
  return fs.readFileSync(path.join(DIR, name), "utf8");
}

/** The ISO week (Lima time) that the captures of 17 Oct 2026 fall in. */
export const WEEK_42 = { startDate: "2026-10-12", endDate: "2026-10-18" } as const;

export const SUTRAN_ALERTS_ENDPOINT = "https://api.sigea.sutran.gob.pe/public/alerts";

/** SUTRAN's listing at 20:56 UTC as the client returns it: the alerts that pass validation and the count of those that do not. */
export function realSutranListing(): { records: SutranAlertRecord[]; invalidCount: number } {
  const body = envelope(z.array(z.unknown())).parse(JSON.parse(readFixture("sutran-alerts-2026-10-17T20-56Z_christian.json")));
  const { valid, invalidCount } = parseEach(body.data, SutranAlertRecordSchema);
  return { records: valid, invalidCount };
}

/** The 13 alerts SUTRAN listed at 20:56 UTC. */
export const realSutranRecords = (): SutranAlertRecord[] => realSutranListing().records;

/** SUTRAN's /historial records for one of the five corridor alerts. */
export function realSutranHistory(alertId: string): SutranHistoryRecord[] {
  const bodies = z.record(z.string(), z.unknown()).parse(JSON.parse(readFixture("sutran-historial-2026-10-17T20-57Z_christian.json")));
  const body = envelope(z.array(z.unknown())).parse(bodies[alertId]);
  return parseEach(body.data, SutranHistoryRecordSchema).valid;
}

export function realRoadAlert(code: string): RoadAlert {
  const record = realSutranRecords().find((candidate) => candidate.codigo === code);
  const alert = record ? normalizeSutranAlert(record) : null;
  if (!alert) throw new Error(`The SUTRAN capture has no alert ${code}`);
  return alert;
}

export const realRoadAlertHistory = (alert: RoadAlert) => normalizeSutranHistory(realSutranHistory(alert.id));

/** Google News RSS answer to NEWS_QUERIES[queryNumber - 1], captured at 22:12 UTC. */
export function realGoogleNewsFeed(queryNumber: 1 | 2 | 3 | 4 | 5 | 6): string {
  return readFixture(`google-news-q${queryNumber}-2026-10-17T22-12Z_christian.xml`);
}

/** Google News answer to `Chosica when:7d` at 21:28 UTC, reduced to its one item with a "|" in the title. */
export const realGoogleNewsChosicaFeed = () => readFixture("google-news-chosica-2026-10-17T21-28Z_christian.xml");

/** INDECI feed page (subset of its items, verbatim), captured at 22:13 UTC. */
export function realIndeciFeedPage(page: 1 | 2 | 3): string {
  return readFixture(`indeci-feed-page${page}-2026-10-17T22-13Z_christian.xml`);
}

/** The corridor-district item of 12–18 Oct read at 21:32 UTC: the Surco (Huarochirí) forest-fire report. */
export const realIndeciCorridorItems = () => readFixture("indeci-feed-corridor-items-2026-10-17T21-32Z_christian.xml");

/**
 * INDECI's feed searched for "huaico chosica" at 22:34 UTC: one corridor huaico report, published on 7 Feb 2020 (UTC),
 * in the older format whose description has no occurrence table.
 */
export const realIndeciSearchFeed = () => readFixture("indeci-feed-search-huaico-chosica-2026-10-17T22-34Z_christian.xml");

/** The ISO week (Lima time) in which that 2020 report was published. */
export const WEEK_2020_06 = { startDate: "2020-02-03", endDate: "2020-02-09" } as const;

export function realIndeciReportPage(name: "sartimbamba" | "san-juan-de-miraflores"): string {
  return readFixture(`indeci-report-${name}-2026-10-17T22-12Z_christian.html`);
}

export const realIndeciBulletinPage = () => readFixture("indeci-bulletin-quebradas-191-2026-10-17T22-21Z_christian.html");

/** Andina's HTTP 404 page for a wrong RSS path: a real answer that is not a feed. */
export const realNonFeedPage = () => readFixture("andina-rss-not-found-2026-10-17_christian.html");

/** The state the job wrote after its first two runs (21:48 and 21:58 UTC), before the road-name-only rule. */
export function realEarlierState(): WeeklyState {
  return WeeklyStateSchema.parse(JSON.parse(readFixture("weekly-report-state-2026-10-17T21-58Z_christian.json")));
}

/** The run logs of those two runs. */
export const realRunLogs = (): RunLog[] => realEarlierState().runs;

/** INDECI titles, verbatim. Feed titles come from the captures; the rest from the cited INDECI pages and files. */
export const INDECI_TITLES = {
  /** Feed page 3: a corridor district (PE-3S), with a hazard that is not a road hazard. */
  canchayllo:
    "REPORTE COMPLEMENTARIO N.° 14360 – 16/10/2026 / COEN – INDECI / 23:20 HORAS (Reporte N.º 1) VIENTOS FUERTES EN EL DISTRITO DE CANCHAYLLO – JUNÍN",
  /** Corridor items: no "EN" before "EL DISTRITO"; updates a fire of 30 Sep 2026. */
  surco:
    "REPORTE COMPLEMENTARIO N.º 14162 – 14/10/2026 / COEN – INDECI / 22:10 HORAS (Reporte N.° 5) INCENDIO FORESTAL EL DISTRITO DE SURCO – LIMA",
  /** Feed read at 21:32 UTC; its description (left out) gives a home address. */
  ate: "REPORTE COMPLEMENTARIO N.º 14012 – 12/10/2026 / COEN – INDECI / 21:50 HORAS (Reporte N.º 2) INCENDIO URBANO EN EL DISTRITO DE ATE – LIMA",
  /** Feed read at 21:32 UTC; not the corridor's Lurigancho. Its description (left out) gives a home address. */
  sanJuanDeLurigancho:
    "REPORTE COMPLEMENTARIO N.° 142302 – 16/10/2026 / COEN – INDECI / 07:40 HORAS (Reporte N.º 1) INCENDIO URBANO EN EL DISTRITO DE SAN JUAN DE LURIGANCHO – LIMA",
  /** Feed page 2: a road hazard outside the corridor. */
  contumaza:
    "REPORTE COMPLEMENTARIO N.° 14369 – 17/10/2026 / COEN – INDECI / 02:45 HORAS (Reporte N.º 1) DERRUMBE DE CERRO EN EL DISTRITO DE CONTUMAZÁ – CAJAMARCA",
  /** Feed page 1: a bulletin, with no district. */
  bulletin: "BOLETÍN INFORMATIVO DE AVISO DE CORTO PLAZO ANTE POSIBLE ACTIVACIÓN DE QUEBRADAS N°191 17-10-2026",
  /** Feed page 1 at 22:13 UTC (not in the kept subset): a preliminary report, without a "(Reporte N.º …)" counter. */
  toroPreliminary:
    "REPORTE PRELIMINAR N.° 1059 – 17/10/2026 / COEN-INDECI / 11:15 HORAS INCENDIO FORESTAL EN EL DISTRITO DE TORO – AREQUIPA",
  /** portal.indeci.gob.pe/emergencias listing (9 Oct 2026): "POR" before the hazard. */
  ocona:
    "REPORTE DE PELIGRO INMINENTE N.º 0084 – 9/10/2026/ COEN – INDECI / 23:00 HORAS (Reporte N.º 1) POR LLUVIAS INTENSAS EN EL DISTRITO DE OCOÑA – AREQUIPA",
  /** portal.indeci.gob.pe/emergencias listing (9 Oct 2026): a province-level report. */
  paruro:
    "REPORTE COMPLEMENTARIO N.° 13816 – 9/10/2026 / COEN – INDECI / 22:25 HORAS (Reporte N.° 2) INCENDIO FORESTAL EN LA PROVINCIA DE PARURO – CUSCO",
  /** portal.indeci.gob.pe sidebar (31 Jan 2026): Yauli of Huancavelica, not of Junín. */
  yauliHuancavelica:
    "REPORTE COMPLEMENTARIO N.° 1297 – 31/1/2026 / COEN-INDECI / 16:00 HORAS (Reporte N.° 1) LLUVIAS INTENSAS EN EL DISTRITO DE YAULI – HUANCAVELICA",
  /** portal.indeci.gob.pe/emergencias/reporte-complementario-n-o-1159-28-1-2026-…-perene-junin: INDECI's "DISTRTO" typo. */
  perene:
    "REPORTE COMPLEMENTARIO N.º 1159 – 28/1/2026 / COEN – INDECI / 21:10 HORAS (Reporte N. º 1) HUAICO EN EL DISTRTO DE PERENÉ – JUNÍN",
  /** Title of INDECI's PDF REPORTE-COMPLEMENTARIO-Nº-2745-09NOV2019 (Carretera Central km 96+800): a corridor huaico. */
  sanMateo2019: "HUAICO EN EL DISTRITO DE SAN MATEO - LIMA",
  /** Title of INDECI's PDF REPORTE-COMPLEMENTARIO-Nº-1834-22FEB2023: a corridor province. */
  huarochiri2023: "HUAICO EN LA PROVINCIA DE HUAROCHIRI - LIMA",
  /** Search feed (22:34 UTC): "LURIGANCHO CHOSICA" without the hyphen of the district's name. */
  luriganchoChosica2020:
    "REPORTE COMPLEMENTARIO N° 679 – 6/2/2020 / COEN – INDECI / 19:25 HORAS (Reporte Nº 5) HUAICO EN EL DISTRITO DE LURIGANCHO CHOSICA – LIMA",
} as const;
