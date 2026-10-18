import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { type ReportWindow, type WeeklyState, WeeklyStateSchema } from "@/contracts/weekly-incident-report_christian";
import { type RenderOptions, renderWeeklyReport } from "@/domain/weekly-incident-report/render-report_christian";

/** Invalid state stops collection rather than overwriting previously collected evidence. */
export async function readWeeklyState(file: string, window: ReportWindow): Promise<WeeklyState | null> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const parsed = WeeklyStateSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error(`${path.basename(file)} does not match the weekly state schema; fix it before rerunning.`);
  if (parsed.data.window.startDate !== window.startDate || parsed.data.window.endDate !== window.endDate) {
    throw new Error(`${path.basename(file)} belongs to another report window.`);
  }
  return parsed.data;
}

/** Same-directory rename prevents a crash during writing from truncating the previous file. */
async function atomicWrite(file: string, content: string): Promise<void> {
  const temporary = path.join(path.dirname(file), `${path.basename(file)}.${randomUUID()}_christian.tmp`);
  try {
    await fs.writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, file);
  } finally {
    // The exact temporary filename belongs to this write; never remove other runs' files.
    await fs.rm(temporary, { force: true });
  }
}

/** JSON is the source of truth. Markdown is derived and can be regenerated if the second rename fails. */
export async function writeWeeklyReportFiles(
  jsonFile: string,
  markdownFile: string,
  state: WeeklyState,
  options: RenderOptions,
): Promise<void> {
  const validated = WeeklyStateSchema.parse(state);
  const json = `${JSON.stringify(validated, null, 2)}\n`;
  const markdown = renderWeeklyReport(validated, options);
  await atomicWrite(jsonFile, json);
  await atomicWrite(markdownFile, markdown);
}

/** Prevents simultaneous local collectors from overwriting each other's observations. */
export async function acquireReportLock(outDir: string): Promise<() => Promise<void>> {
  const file = path.join(outDir, ".weekly-report_christian.lock");
  try {
    const handle = await fs.open(file, "wx");
    await handle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Another collector holds ${file}. If a process was killed, remove this lock after checking no collector is running.`);
    }
    throw error;
  }
  return () => fs.unlink(file);
}
