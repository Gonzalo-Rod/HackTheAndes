import type { IndeciPlace, ReportWindow } from "@/contracts/weekly-incident-report_christian";
import { parseSutranDate, regionLabel, titleCase, toSentenceCase } from "@/domain/road-alerts/parsing";

import { decodeEntities } from "./feed-items_christian";
import { isDateInWindow, windowEndMs, windowStartMs } from "./week-window_christian";

// Parsers for INDECI's COEN emergency reports (portal.indeci.gob.pe/emergencias). Titles look
// like "REPORTE COMPLEMENTARIO N.º 14162 – 14/10/2026 / COEN – INDECI / 22:10 HORAS
// (Reporte N.° 5) INCENDIO FORESTAL EL DISTRITO DE SURCO – LIMA"; report pages, and the
// feed's item descriptions, carry a "Fecha y hora de la ocurrencia" table. Titles name one
// district, one province or a department; no multi-district title was found. Pure functions.

/** Longest description kept from a report page. */
const MAX_DESCRIPTION_CHARS = 280;
/** How far past the "Fecha y hora de la ocurrencia" label the date is looked for. */
const OCCURRENCE_SEARCH_CHARS = 1_500;
/** End of the description: the page's download link, or the "The post … appeared first on …" footer of feed descriptions. */
const DESCRIPTION_END = /\bDESCARGAR\b|\bThe post\b.*?\bappeared first on\b/i;

export interface IndeciTitle {
  /** Hazard in sentence case ("Huaico"), or the cleaned title when no hazard could be isolated. */
  hazard: string;
  /** Null when the title names no district or province (bulletins, truncated titles). */
  place: IndeciPlace | null;
}

export interface IndeciReportPage {
  occurredDate: string | null;
  occurredTime: string | null;
  description: string | null;
}

// Place at the end of the title: "EN EL DISTRITO DE <name> – <department>". Real titles sometimes
// drop the "EN" ("INCENDIO FORESTAL EL DISTRITO DE SURCO") or misspell "DISTRTO" (Perené, 28/1/2026).
const PLACE_PATTERN = /(?:\bEN\s+)?(?:\b(?:EL|LA)\s+)?\b(DISTRI?TO|PROVINCIA)\s+DE\s+(.+?)\s+[-–—]\s+([\p{L} ]+?)\s*$/iu;

function hazardText(beforePlace: string): string {
  // Drop the header up to the time ("… / 22:10 HORAS") and the "(Reporte N.° 5)" counter.
  const afterHeader = beforePlace.replace(/^.*\bHORAS\b/i, "").replace(/\((?:REPORTE|INFORME)[^)]*\)/gi, "");
  const hazard = afterHeader.replace(/^\s*POR\s+/i, "").trim();
  return toSentenceCase(hazard || beforePlace.trim());
}

export function parseIndeciTitle(title: string): IndeciTitle {
  const text = title.replace(/\s+/g, " ").trim();
  const match = text.match(PLACE_PATTERN);
  if (!match || match.index === undefined) return { hazard: toSentenceCase(text), place: null };

  return {
    hazard: hazardText(text.slice(0, match.index)),
    place: {
      level: match[1].toUpperCase().startsWith("DISTR") ? "distrito" : "provincia",
      names: [titleCase(match[2])],
      department: regionLabel(match[3]),
    },
  };
}

/** Visible text of an HTML page: no scripts, styles or tags, entities decoded, spaces collapsed. */
export function htmlToText(html: string): string {
  const withoutCode = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");
  return decodeEntities(withoutCode.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseIndeciReportPage(html: string): IndeciReportPage {
  const none = { occurredDate: null, occurredTime: null, description: null };
  const text = htmlToText(html);
  const labelAt = text.search(/fecha\s+y\s+hora\s+de\s+la\s+ocurrencia/i);
  if (labelAt < 0) return none;

  const section = text.slice(labelAt, labelAt + OCCURRENCE_SEARCH_CHARS);
  const match = section.match(/(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  const occurredDate = match ? parseSutranDate(match[1]) : null;
  if (!match || occurredDate === null) return none;

  const hours = match[2] === undefined ? null : Number(match[2]);
  const occurredTime = hours !== null && hours < 24 && Number(match[3]) < 60 ? `${String(hours).padStart(2, "0")}:${match[3]}` : null;
  const afterDate = section
    .slice((match.index ?? 0) + match[0].length)
    .replace(/^\s*horas\b/i, "")
    .split(DESCRIPTION_END)[0]
    .trim();
  const description = afterDate ? afterDate.slice(0, MAX_DESCRIPTION_CHARS).trim() : null;
  return { occurredDate, occurredTime, description };
}

/**
 * Whether a report belongs to the week: by the date of the event when INDECI states it, since
 * reports often follow older events (the Surco report published on 15 Oct 2026 updates a fire
 * of 30 Sep), otherwise by publication before the week ends.
 */
export function isReportInWeek(window: ReportWindow, report: { occurredDate: string | null; publishedAt: string | null }): boolean {
  if (report.occurredDate !== null) return isDateInWindow(window, report.occurredDate);
  return (
    report.publishedAt !== null &&
    Date.parse(report.publishedAt) >= windowStartMs(window) &&
    Date.parse(report.publishedAt) < windowEndMs(window)
  );
}
