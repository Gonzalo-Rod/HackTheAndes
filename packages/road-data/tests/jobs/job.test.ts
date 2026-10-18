import { expect, test, vi } from "vitest";
import { createSutranJob } from "../../src/services/run-sutran-job.ts";
import { createSutranIngestionService } from "../../src/services/ingest-sutran-alerts.ts";
import type { IngestionRunStore, JobLog, JobOutcome } from "../../src/contracts/jobs.ts";
import { fixtureAlert, TestSource, TestRepository } from "../ingestion/support.ts";

async function setup() {
  const source = new TestSource(await fixtureAlert());
  const ingestion = createSutranIngestionService({
    source,
    repository: new TestRepository(),
    logger: () => undefined,
  });
  const records = new Map<string, JobOutcome>();
  const runs: IngestionRunStore = {
    async reserve(requestId) {
      if (records.has(requestId)) return false;
      records.set(requestId, { requestId, status: "running" });
      return true;
    },
    async read(requestId) {
      const record = records.get(requestId);
      if (!record) throw new Error("Missing test record");
      return record;
    },
    async finish(outcome) {
      records.set(outcome.requestId, outcome);
    },
  };
  const logs: JobLog[] = [];
  const run = createSutranJob({ ingestion, runs, logger: (entry) => logs.push(entry) });
  return { run, source, ingestion, records, logs, runs };
}
test("archives data and a redacted audit, then reuses the outcome on a duplicate request", async () => {
  const { run, source, records } = await setup();
  const outcome = await run("n8n-1", new AbortController().signal);
  expect(outcome.status).toBe("complete");
  expect(outcome.counts?.inserted).toBe(1);
  expect(records.get("n8n-1")).toEqual(outcome);
  expect(await run("n8n-1", new AbortController().signal)).toEqual(outcome);
  expect(source.requestIds.filter((id) => id === "n8n-1")).toHaveLength(2);
  expect(outcome).not.toHaveProperty("issues");
});
test("concurrent requests with the same execution ID perform ingestion once", async () => {
  const { run, source } = await setup();
  const results = await Promise.all([
    run("same", new AbortController().signal),
    run("same", new AbortController().signal),
  ]);
  expect(results.map((value) => value.status).sort()).toEqual(["complete", "running"]);
  expect(source.historyCalls).toHaveLength(1);
});
test("records a partial outcome when history is pending", async () => {
  const { run, source } = await setup();
  source.history = {
    ...source.history,
    complete: false,
    rejected: [{ index: 0, issues: [{ path: "x", message: "invalid" }] }],
    receivedCount: source.history.records.length + 1,
  };
  const result = await run("partial", new AbortController().signal);
  expect(result.status).toBe("partial");
  expect(result.error?.code).toBe("partial_ingestion");
});
test("records a safe failure and prevents ingestion after cancellation", async () => {
  const { run, source, records, logs } = await setup();
  const controller = new AbortController();
  controller.abort(new Error("sensitive provider payload"));
  const result = await run("cancelled", controller.signal);
  expect(result.error?.code).toBe("job_cancelled");
  expect(source.requestIds).toHaveLength(0);
  expect(records.get("cancelled")?.status).toBe("failure");
  expect(JSON.stringify([result, logs])).not.toContain("sensitive provider payload");
});
test("does not claim success when the durable audit cannot finish", async () => {
  const { ingestion, runs } = await setup();
  runs.finish = vi.fn(async () => {
    throw new Error("audit unavailable");
  });
  const run = createSutranJob({ ingestion, runs, logger: () => undefined });
  await expect(run("audit-failure", new AbortController().signal)).rejects.toThrow(
    "audit unavailable",
  );
});
