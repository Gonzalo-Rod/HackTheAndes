// Weekly Carretera Central incident report. Collects official alerts (SUTRAN), emergency
// reports (INDECI) and news titles to review (Google News) into one state file per ISO week
// (Lima time) and renders the Markdown report next to it. Safe to run several times a day:
// each run merges into the week's state. Runs daily in .github/workflows/weekly-incident-report_christian.yml.
//
// Usage: npx tsx scripts/weekly-incident-report_christian.ts [--week-of YYYY-MM-DD] [--out <dir>]
//   --week-of  update only the week containing this date (sources still return current data)
//   --out      output directory (default docs/research/weekly)

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { env } from "../src/config/env";
import { type ReportWindow, type WeeklyState, WeeklyStateSchema } from "../src/contracts/weekly-incident-report_christian";
import { renderWeeklyReport } from "../src/domain/weekly-incident-report/render-report_christian";
import { isIsoDate, weekContaining, windowLabel, windowsToUpdate } from "../src/domain/weekly-incident-report/week-window_christian";
import { emptyWeeklyState } from "../src/domain/weekly-incident-report/weekly-state_christian";
import { createGoogleNewsClient } from "../src/integrations/google-news/google-news-client_christian";
import { createIndeciClient } from "../src/integrations/indeci/indeci-client_christian";
import { createSutranClient } from "../src/integrations/sutran/sutran-client";
import { allSourcesFailed, createWeeklyIncidentReportService } from "../src/services/weekly-incident-report-service_christian";

const DEFAULT_OUT_DIR = path.resolve(import.meta.dirname, "..", "docs", "research", "weekly");

interface Args {
  weekOf: string | null;
  outDir: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { weekOf: null, outDir: DEFAULT_OUT_DIR };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--week-of" && value) {
      if (!isIsoDate(value)) throw new Error(`Invalid --week-of date: ${value}`);
      args.weekOf = value;
      i++;
    } else if (flag === "--out" && value) {
      args.outDir = path.resolve(value);
      i++;
    } else {
      throw new Error(`Unknown or incomplete argument: ${flag}. Usage: [--week-of YYYY-MM-DD] [--out <dir>]`);
    }
  }
  return args;
}

/** The week's previous state, or null when this is its first run. Invalid files stop the run instead of being overwritten. */
async function readState(file: string, window: ReportWindow): Promise<WeeklyState | null> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const parsed = WeeklyStateSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error(`${path.basename(file)} does not match the weekly state schema; fix or remove it before rerunning.`);
  if (parsed.data.window.startDate !== window.startDate)
    throw new Error(`${path.basename(file)} belongs to another week (${parsed.data.window.startDate}).`);
  return parsed.data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = Date.now();
  const windows = args.weekOf ? [weekContaining(args.weekOf)] : windowsToUpdate(now);

  const roadAlerts = createSutranClient({ baseUrl: env.SUTRAN_API_BASE });
  const service = createWeeklyIncidentReportService({
    roadAlerts,
    emergencies: createIndeciClient(),
    news: createGoogleNewsClient(),
    now: () => Date.now(),
    requestId: `weekly-report-${randomUUID()}`,
  });

  await fs.mkdir(args.outDir, { recursive: true });
  let failedWeeks = 0;
  for (const window of windows) {
    const stem = `pe22-incidents-${windowLabel(window)}_christian`;
    const jsonFile = path.join(args.outDir, `${stem}.json`);
    const markdownFile = path.join(args.outDir, `${stem}.md`);

    const previous = await readState(jsonFile, window);
    const { state, run } = await service.update(previous ?? emptyWeeklyState(window, new Date(now).toISOString()));
    const summary = Object.entries(run.sources)
      .map(([name, source]) => `${name} ${source.ok ? `ok (${source.kept})` : `failed (${source.note})`}`)
      .join(", ");

    if (allSourcesFailed(run)) {
      failedWeeks++;
      console.error(`${stem}: every source failed (${summary}); kept the previous files.`);
      continue;
    }
    await fs.writeFile(jsonFile, `${JSON.stringify(state, null, 2)}\n`);
    await fs.writeFile(markdownFile, renderWeeklyReport(state, { sutranAlertsEndpoint: roadAlerts.endpoint }));
    console.log(`${stem}: ${summary}. Wrote ${path.relative(process.cwd(), markdownFile)}`);
  }
  if (failedWeeks > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`Weekly incident report failed; previous files were kept. ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
