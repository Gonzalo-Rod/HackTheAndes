import { randomBytes } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { createSutranJobHandler } from "../../src/app/sutran-job-handler.ts";
import { parseJobConfiguration } from "../../src/config/env.ts";
import type { JobLog, JobOutcome } from "../../src/contracts/jobs.ts";

const secret = randomBytes(32).toString("base64url");
function setup(status: JobOutcome["status"] = "complete") {
  const run = vi.fn(async (requestId: string): Promise<JobOutcome> => ({ requestId, status }));
  const logs: JobLog[] = [];
  const handler = createSutranJobHandler({ secret, run, logger: (entry) => logs.push(entry) });
  const request = (
    options: {
      authorization?: string;
      method?: string;
      body?: string;
      headers?: Record<string, string>;
    } = {},
  ) =>
    new Request("https://example.com/api/jobs/sutran", {
      method: options.method ?? "POST",
      headers: {
        authorization: options.authorization ?? `Bearer ${secret}`,
        "content-type": "application/json",
        ...options.headers,
      },
      ...((options.method ?? "POST") === "GET"
        ? {}
        : { body: options.body ?? JSON.stringify({ requestId: "n8n-sutran-42" }) }),
    });
  return { run, logs, handler, request };
}

describe("internal SUTRAN job boundary", () => {
  test.each(["", "Bearer wrong", `Basic ${secret}`, `Bearer ${secret.slice(1)}`])(
    "rejects invalid credentials before accessing ingestion: %s",
    async (authorization) => {
      const { handler, run, request } = setup();
      expect((await handler(request({ authorization }))).status).toBe(401);
      expect(run).not.toHaveBeenCalled();
    },
  );
  test("rejects a missing credential", async () => {
    const { handler, request, run } = setup();
    const input = request();
    input.headers.delete("authorization");
    expect((await handler(input)).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
  test("accepts a valid credential, passes the execution ID, and disables caching", async () => {
    const { handler, request, run, logs } = setup();
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("n8n-sutran-42");
    expect(run.mock.calls[0]?.[0]).toBe("n8n-sutran-42");
    expect(JSON.stringify(logs)).not.toContain(secret);
  });
  test.each([
    ["GET", 405],
    ["PUT", 405],
  ])("rejects the %s method", async (method, expected) => {
    const { handler, request, run } = setup();
    expect((await handler(request({ method }))).status).toBe(expected);
    expect(run).not.toHaveBeenCalled();
  });
  test("rejects non-JSON requests", async () => {
    const { handler, request, run } = setup();
    expect((await handler(request({ headers: { "content-type": "text/plain" } }))).status).toBe(
      415,
    );
    expect(run).not.toHaveBeenCalled();
  });
  test.each(["{", "null", '{"requestId":"bad id"}', '{"requestId":"42","roadCode":"other"}', "{}"])(
    "rejects malformed or unexpected input: %s",
    async (body) => {
      const { handler, request, run } = setup();
      expect((await handler(request({ body }))).status).toBe(400);
      expect(run).not.toHaveBeenCalled();
    },
  );
  test("enforces the actual body limit even without Content-Length", async () => {
    const { handler, request, run } = setup();
    expect((await handler(request({ body: " ".repeat(1025) }))).status).toBe(413);
    expect(run).not.toHaveBeenCalled();
  });
  test.each(["partial", "failure", "running"] as const)(
    "does not report %s as a successful ingestion",
    async (status) => {
      const { handler, request } = setup(status);
      expect((await handler(request())).status).toBe(status === "running" ? 409 : 503);
    },
  );
  test("redacts infrastructure errors in the response and logs", async () => {
    const { handler, request, run, logs } = setup();
    run.mockRejectedValue(new Error(`database password ${secret}`));
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(secret);
    expect(JSON.stringify(logs)).not.toContain(secret);
  });
  test("passes cancellation through to ingestion", async () => {
    const controller = new AbortController();
    controller.abort();
    let cancelled = false;
    const handler = createSutranJobHandler({
      secret,
      logger: () => undefined,
      run: async (requestId, signal) => {
        cancelled = signal.aborted;
        return { requestId, status: "failure" };
      },
    });
    await handler(
      new Request("https://example.com/api/jobs/sutran", {
        method: "POST",
        signal: controller.signal,
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ requestId: "cancelled-1" }),
      }),
    );
    expect(cancelled).toBe(true);
  });
  test("validates job configuration without disclosing its value", () => {
    expect(() => parseJobConfiguration({ ROAD_DATA_JOB_SECRET: "too-short" })).toThrow(
      "ROAD_DATA_JOB_SECRET",
    );
    expect(() => parseJobConfiguration({ ROAD_DATA_JOB_SECRET: "too-short" })).not.toThrow(
      "too-short",
    );
  });
});
