import { randomBytes } from "node:crypto";
import { beforeEach, afterEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configuration: vi.fn(),
  pool: vi.fn(),
  handler: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/config/env", () => ({
  loadConfiguration: mocks.configuration,
}));
vi.mock("@peruroad/road-data/database", () => ({
  createDatabasePool: mocks.pool,
}));
vi.mock("@peruroad/road-data/jobs", () => ({
  createPostgresSutranJobHandler: mocks.handler,
}));

const secret = randomBytes(32).toString("base64url");
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.configuration.mockReturnValue({
    DATABASE_URL: "postgresql://unused@localhost:1/peruroad_test",
    DATABASE_SSL_MODE: "disable",
    ROAD_DATA_JOB_SECRET: secret,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

test("reuses its pool/handler and delegates the original request without interpreting source data", async () => {
  const downstream = vi.fn(async () => Response.json({ status: "complete" }));
  mocks.handler.mockReturnValue(downstream);
  const { runSutranJob } = await import("../src/services/sutran-job");
  const request = new Request("http://localhost/api/jobs/sutran", {
    method: "POST",
  });
  expect((await runSutranJob(request)).status).toBe(200);
  await runSutranJob(request);
  expect(mocks.pool).toHaveBeenCalledTimes(1);
  expect(downstream).toHaveBeenCalledWith(request);
});

test("configuration failure is redacted and a later valid initialization can recover", async () => {
  const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.configuration.mockImplementationOnce(() => {
    throw new Error(`private ${secret}`);
  });
  mocks.handler.mockReturnValue(async () =>
    Response.json({ status: "complete" }),
  );
  const { runSutranJob } = await import("../src/services/sutran-job");
  const request = new Request("http://localhost/api/jobs/sutran", {
    method: "POST",
  });
  const failed = await runSutranJob(request);
  expect(failed.status).toBe(503);
  expect(failed.headers.get("cache-control")).toBe("no-store");
  expect(await failed.text()).not.toContain(secret);
  expect(JSON.stringify(logs.mock.calls)).not.toContain(secret);
  expect(mocks.pool).not.toHaveBeenCalled();
  expect((await runSutranJob(request)).status).toBe(200);
});

test("an unexpected handler exception returns a safe response and correlation ID", async () => {
  const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.handler.mockReturnValue(async () => {
    throw new Error(`connection password ${secret}`);
  });
  const { runSutranJob } = await import("../src/services/sutran-job");
  const response = await runSutranJob(
    new Request("http://localhost/api/jobs/sutran", { method: "POST" }),
  );
  expect(response.status).toBe(503);
  expect(response.headers.get("x-request-id")).toBeTruthy();
  expect(await response.json()).toEqual({
    error: {
      code: "job_unavailable",
      message: "Ingestion is unavailable; committed records were preserved",
    },
  });
  expect(JSON.stringify(logs.mock.calls)).not.toContain(secret);
});
