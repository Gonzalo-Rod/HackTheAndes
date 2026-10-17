import type { AlertCause, RoadStatus } from "@/contracts/road-alerts";
import type { IndeciEntry, NewsEntry, SourceRun, SutranEntry, WeeklyState } from "@/contracts/weekly-incident-report_christian";
import { LIMA_UTC_OFFSET_MS } from "@/lib/time";

import { windowTitle } from "./week-window_christian";

// Renders the weekly state as the Markdown report committed next to it. English text for the
// team, provider values quoted in Spanish, and "no indicado" for missing fields (the team's
// research convention). Pure function of the state and the options.

export interface RenderOptions {
  /** SUTRAN alert list endpoint; each alert links to `${endpoint}/${id}`. */
  sutranAlertsEndpoint: string;
}

const MISSING = "no indicado";
/** Longest provider text shown in a table cell. */
const MAX_CELL_CHARS = 220;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CAUSE_LABELS: Record<AlertCause, string> = {
  accidentes: "Accident",
  infraestructura: "Roadworks or infrastructure",
  fenomenos_naturales: "Natural hazard",
  humano: "Human activity",
  otro: "Other",
};

const STATUS_LABELS: Record<RoadStatus, string> = {
  interrumpido: "Closed",
  restringido: "Restricted",
  normal: "Open",
  desconocido: MISSING,
};

const SOURCE_NAMES: Record<keyof WeeklyState["runs"][number]["sources"], string> = {
  sutran: "SUTRAN",
  indeci: "INDECI",
  googleNews: "Google News",
};

/** Table-safe text: one line, pipes escaped, long provider text shortened. */
function cell(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return MISSING;
  const short = text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS - 1).trimEnd()}…` : text;
  return short.replace(/\|/g, "\\|");
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return MISSING;
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS_SHORT[month - 1]} ${year}`;
}

/** "17 Oct 2026, 16:55" in Lima time. */
export function formatLimaDateTime(iso: string | null): string {
  if (!iso) return MISSING;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return MISSING;
  const lima = new Date(ms + LIMA_UTC_OFFSET_MS).toISOString();
  return `${formatDate(lima.slice(0, 10))}, ${lima.slice(11, 16)}`;
}

function sourceStatus(name: string, run: SourceRun): string {
  if (!run.ok) return `${name}: failed (${run.note ?? "error"})`;
  return `${name}: ok, ${run.kept} kept${run.note ? ` (${run.note})` : ""}`;
}

function historyText(entry: SutranEntry): string {
  const steps = [...entry.history]
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .map((step) => {
      const what = step.type === "publicacion" ? "published" : step.newStatus ? `set to \`${step.newStatus}\`` : step.type;
      return `${formatLimaDateTime(step.date)} ${what}`;
    });
  return steps.length ? steps.join("; ") : MISSING;
}

/** SUTRAN's title, plus its description when that adds something ("Accidente KM 06. Accidente de un vehículo…"). */
function alertDetails(title: string, description: string): string {
  if (!title) return description;
  if (!description || title.toLowerCase().includes(description.toLowerCase())) return title;
  return `${title.replace(/\.$/, "")}. ${description}`;
}

function sutranTable(entries: SutranEntry[], options: RenderOptions): string {
  if (entries.length === 0) return "No SUTRAN alert on the corridor has an event date in this week.";
  const endpoint = options.sutranAlertsEndpoint.replace(/\/+$/, "");
  const rows = entries.map((entry, i) => {
    const { alert } = entry;
    const place = `${alert.roadCode} ${alert.kmText || "km no indicado"}, ${alert.district || MISSING} (${alert.province || MISSING}, ${alert.region || MISSING}); direction ${alert.direction || MISSING}`;
    const type = `${CAUSE_LABELS[alert.cause]}: ${alertDetails(alert.title, alert.description)}`;
    const status = `${STATUS_LABELS[alert.roadStatus]} (\`${alert.roadStatus}\`): "${alert.currentSituation || MISSING}"`;
    const reporter = alert.source || alert.administrator;
    const source = `[SUTRAN ${alert.code || alert.id}](${endpoint}/${encodeURIComponent(alert.id)})${reporter ? `, reported by ${reporter}` : ""}`;
    const listed = entry.listedInLatestRun
      ? `Yes, valid until ${formatDate(alert.validUntil)}`
      : `No longer listed (last seen ${formatLimaDateTime(entry.lastSeenAt)})`;
    return `| ${i + 1} | ${formatDate(alert.eventDate)} | ${cell(place)} | ${cell(type)} | ${cell(status)} | ${cell(historyText(entry))} | ${source} | ${listed} |`;
  });
  return [
    "| # | Event date | Place and km | Type | Road status | Status changes (Lima) | Source | Still in SUTRAN? |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function indeciTable(entries: IndeciEntry[]): string {
  if (entries.length === 0) return "No INDECI emergency report in a corridor district with a road-related hazard this week.";
  const rows = entries.map((entry, i) => {
    const occurred = entry.occurredDate
      ? `${formatDate(entry.occurredDate)}${entry.occurredTime ? `, ${entry.occurredTime}` : ""}`
      : `${MISSING} (published ${formatLimaDateTime(entry.publishedAt)})`;
    const level = entry.place.level === "distrito" ? "District" : "Province";
    const place = `${level} of ${entry.place.names.join(", ")} (${entry.place.department})`;
    return `| ${i + 1} | ${occurred} | ${cell(place)} | ${cell(entry.hazard)} | ${cell(entry.description)} | [INDECI COEN](${entry.url}) |`;
  });
  return ["| # | Occurred (Lima) | Place | Hazard | INDECI description | Report |", "| --- | --- | --- | --- | --- | --- |", ...rows].join(
    "\n",
  );
}

function newsTable(entries: NewsEntry[]): string {
  if (entries.length === 0) return "No news title matched the corridor and an incident term this week.";
  const rows = entries.map((entry, i) => {
    const terms = [...entry.placeTerms, ...entry.incidentTerms].join(", ");
    return `| ${i + 1} | ${formatLimaDateTime(entry.listedAt)} | ${cell(entry.title)} | ${cell(entry.outlet)} | ${cell(terms)} | [link](${entry.url}) |`;
  });
  return [
    "| # | Listed by Google News (Lima) | Title | Outlet | Matched terms | Link |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

export function renderWeeklyReport(state: WeeklyState, options: RenderOptions): string {
  const latest = state.runs.at(-1);
  const first = state.runs[0];
  const status = latest
    ? (Object.keys(SOURCE_NAMES) as (keyof typeof SOURCE_NAMES)[])
        .map((key) => sourceStatus(SOURCE_NAMES[key], latest.sources[key]))
        .join("; ")
    : "no run yet";

  return [
    `# Carretera Central (PE-22) road incidents, ${windowTitle(state.window)}`,
    "",
    "Automated weekly report for the PeruRoad Climate team, written by `scripts/weekly-incident-report_christian.ts` from",
    "the state file next to it. Official sources are listed as reported; news items need a human check before anyone uses them.",
    "",
    `- **Window:** ${formatDate(state.window.startDate)} to ${formatDate(state.window.endDate)} (America/Lima), Monday to Sunday.`,
    "- **Corridor:** PE-22 Lima–La Oroya (Lima, Huarochirí and Yauli provinces) and PE-3S La Oroya–Huancayo (Yauli, Jauja,",
    "  Concepción and Huancayo provinces).",
    `- **Runs:** ${state.runs.length}${first ? `, first ${formatLimaDateTime(first.at)}` : ""}, last updated ${formatLimaDateTime(state.updatedAt)}.`,
    `- **Sources in the latest run:** ${status}.`,
    "",
    "## Official: SUTRAN alerts on the corridor",
    "",
    "Alerts from SUTRAN's public API with an event date (`fechaEvento`) in this week. SUTRAN gives no event time; the status",
    "changes come from each alert's `/historial`. Alerts are read every run, so ones that expire mid-week are kept.",
    "",
    sutranTable(state.sutran, options),
    "",
    "## Official: INDECI emergency reports in corridor districts",
    "",
    "COEN reports for districts along the corridor with a hazard that can affect the road (landslides, huaicos, rain, snow,",
    "road accidents). INDECI does not always say whether the road was affected; read the report.",
    "",
    indeciTable(state.indeci),
    "",
    "## News to review",
    "",
    "Google News titles that name a corridor place and an incident word. Google News dates are listing dates and can belong",
    "to an older article that was re-indexed, so confirm the place and the event date on the article before using an item.",
    "",
    newsTable(state.news),
    "",
    "## Not covered by this job",
    "",
    "- Facebook, Instagram and X posts, which need a login to read. Deviandes publishes its alerts there; most reach SUTRAN.",
    "- Provías Nacional's emergency viewer, which covers the non-concessioned national network and has no public dated feed.",
    "",
  ].join("\n");
}
