import { randomBytes } from "node:crypto";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  pool: vi.fn(),
  repository: vi.fn(),
  service: vi.fn(),
  handler: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@peruroad/road-data/database", () => ({
  createDatabasePool: mocks.pool,
}));
vi.mock("@peruroad/road-data/context", () => ({
  loadRoadContextServerConfiguration: mocks.config,
  createPostgresRoadContextRepository: mocks.repository,
  createRoadContextService: mocks.service,
  createRoadContextHandler: mocks.handler,
}));
const secret = randomBytes(32).toString("base64url");
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.config.mockReturnValue({
    ROAD_DATA_API_SECRET: secret,
    ROAD_DATA_GEOMETRY_REVISION: "f".repeat(64),
  });
  mocks.service.mockReturnValue({ execute: vi.fn() });
});
afterEach(() => vi.restoreAllMocks());
test("context runtime initializes once and delegates the untouched request", async () => {
  const downstream = vi.fn(async () => Response.json({ state: "ready" }));
  mocks.handler.mockReturnValue(downstream);
  const { runRoadContext } = await import("../src/services/road-context");
  const request = new Request(
    "https://example.test/api/internal/road-context",
    { method: "POST" },
  );
  expect((await runRoadContext(request)).status).toBe(200);
  await runRoadContext(request);
  expect(mocks.pool).toHaveBeenCalledTimes(1);
  expect(mocks.repository).toHaveBeenCalledWith(undefined, "f".repeat(64));
  expect(downstream).toHaveBeenCalledWith(request);
});
test("invalid configuration is redacted and can recover on a later request", async () => {
  const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.config.mockImplementationOnce(() => {
    throw new Error(secret);
  });
  mocks.handler.mockReturnValue(async () => Response.json({ state: "ready" }));
  const { runRoadContext } = await import("../src/services/road-context");
  const request = new Request("https://example.test", { method: "POST" });
  const failed = await runRoadContext(request);
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain(secret);
  expect(JSON.stringify(logs.mock.calls)).not.toContain(secret);
  expect((await runRoadContext(request)).status).toBe(200);
});
