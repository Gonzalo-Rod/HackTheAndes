import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readLatest: vi.fn(), roads: vi.fn() }));
vi.mock("@/config/env", () => ({
  loadNotificationConfiguration: () => ({ jobSecret: "synthetic-job-secret" }),
  loadPlatformConfiguration: vi.fn(),
  loadZavuConfiguration: vi.fn(),
  loadGeometryRevision: vi.fn(),
}));
vi.mock("@/db/pool", () => ({ database: vi.fn() }));
vi.mock("@/services/platform/forecast-roads", () => ({ loadForecastRoads: mocks.roads }));
vi.mock("@peruroad/road-data/exposure", async (original) => ({
  ...(await original<typeof import("@peruroad/road-data/exposure")>()),
  createExposureRepository: () => ({ readLatest: mocks.readLatest, save: vi.fn() }),
}));
import { refreshClimate } from "./jobs";

const NOW = Date.parse("2026-10-18T12:00:00.000Z");
const road = (roadCode: string, revision: string) => ({
  roadCode,
  name: roadCode,
  geometryRevision: revision.repeat(64),
  measuredLengthKm: 100,
  pilot: roadCode === "PE-22",
});
const freshRecord = (id: string) => ({
  assessment: { assessmentId: id.repeat(64), sources: { weatherCapturedAt: new Date(NOW - 10 * 60_000).toISOString() } },
});
const request = () =>
  new Request("https://example.test/api/jobs/climate", { method: "POST", headers: { authorization: "Bearer synthetic-job-secret" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  mocks.roads.mockResolvedValue([road("PE-22", "a"), road("PE-3N", "b"), road("PE-5N", "c")]);
});

it("refreshes each forecast road independently and keeps the pilot fields at the top level", async () => {
  mocks.readLatest.mockImplementation(async (revision: string) => {
    if (revision === "a".repeat(64)) return freshRecord("1");
    if (revision === "b".repeat(64)) throw new Error("private connection detail");
    return null;
  });
  const response = await refreshClimate(request());
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ state: "fresh", roadCode: "PE-22", assessmentId: "1".repeat(64) });
  expect(body.roads).toEqual([
    expect.objectContaining({ roadCode: "PE-22", state: "fresh" }),
    { roadCode: "PE-3N", state: "failed", errorType: "Error" },
    { roadCode: "PE-5N", state: "unavailable" },
  ]);
  expect(JSON.stringify(body)).not.toContain("private");
});

it("fails visibly when no road has a spatial base", async () => {
  mocks.readLatest.mockResolvedValue(null);
  const response = await refreshClimate(request());
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe("exposure_unavailable");
});
