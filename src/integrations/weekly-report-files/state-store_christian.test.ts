import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { realEarlierState, SUTRAN_ALERTS_ENDPOINT, WEEK_42 } from "@/test/fixtures/weekly-report_christian";

import { acquireReportLock, readWeeklyState, writeWeeklyReportFiles } from "./state-store_christian";

let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-report-christian-"));
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

describe("weekly report files", () => {
  it("round-trips the real state, renders Markdown and leaves no staging files", async () => {
    const json = path.join(directory, "report_christian.json");
    const markdown = path.join(directory, "report_christian.md");
    expect(await readWeeklyState(json, WEEK_42)).toBeNull();
    const state = realEarlierState();
    await writeWeeklyReportFiles(json, markdown, state, { sutranAlertsEndpoint: SUTRAN_ALERTS_ENDPOINT });
    await writeWeeklyReportFiles(json, markdown, state, { sutranAlertsEndpoint: SUTRAN_ALERTS_ENDPOINT });
    expect(await readWeeklyState(json, WEEK_42)).toEqual(state);
    expect(await fs.readFile(markdown, "utf8")).toContain("SIGEA-171026-02");
    expect((await fs.readdir(directory)).sort()).toEqual(["report_christian.json", "report_christian.md"]);
  });

  it("rejects broken JSON and a mismatched week without changing the file", async () => {
    const json = path.join(directory, "report_christian.json");
    await fs.writeFile(json, "{");
    await expect(readWeeklyState(json, WEEK_42)).rejects.toThrow();
    expect(await fs.readFile(json, "utf8")).toBe("{");
    await fs.writeFile(json, JSON.stringify(realEarlierState()));
    await expect(readWeeklyState(json, { ...WEEK_42, endDate: "2026-10-19" })).rejects.toThrow("another report window");
  });

  it("rejects overlapping collectors and allows the next one after release", async () => {
    const release = await acquireReportLock(directory);
    await expect(acquireReportLock(directory)).rejects.toThrow("Another collector holds");
    await release();
    const releaseNext = await acquireReportLock(directory);
    await releaseNext();
    expect(await fs.readdir(directory)).toEqual([]);
  });
});
