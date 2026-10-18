import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { readBundledExposure } from "@peruroad/road-data/exposure";
import { ExposureLayerSchema } from "@/contracts/exposure";
import { ForecastRoadsResponseSchema } from "@/contracts/forecast-roads";
import { readExposure, readForecastRoads } from "./exposure";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/db/exposure", () => ({ readLatestExposure: mocks.read }));
vi.mock("@peruroad/road-data/exposure", async (original) => {
  const actual = await original<typeof import("@peruroad/road-data/exposure")>();
  return { ...actual, readBundledExposure: vi.fn(actual.readBundledExposure) };
});
let record: Awaited<ReturnType<typeof readBundledExposure>>;
beforeAll(async () => {
  record = await readBundledExposure();
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.parse(record.assessment.assessedAt) + 1000));
  mocks.read.mockResolvedValue(record);
});
afterEach(() => {
  vi.useRealTimers();
});
const request = (query = "") => new Request(`https://example.test/api/exposure${query}`);
it("returns a validated public assessment with no writes or raw input bundle, with fresh-database alert eligibility", async () => {
  const response = await readExposure(request("?horizonHours=72"));
  expect(response.status).toBe(200);
  const value = ExposureLayerSchema.parse(await response.json());
  expect(value.meta).toMatchObject({ storage: "database", state: "ready", selectedHorizonHours: 72, automatedAlertUse: true });
  expect(value.data.segments).toHaveLength(174);
  // Since the containing-basin links every PE-22 segment has catchments and an assessed category.
  expect(value.data.segments.every((s) => s.catchmentIds.length > 0 && s.windows.next72h.state === "assessed")).toBe(true);
  expect(Object.keys(value)).toEqual(["data", "meta"]);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(value.data.sources.forecastIssuedAt).toBeNull();
});
it("uses a dated validated bundle when persistence is unavailable", async () => {
  mocks.read.mockRejectedValueOnce(new Error("private SQL connection string"));
  const response = await readExposure(request());
  const value = ExposureLayerSchema.parse(await response.json());
  expect(value.meta.storage).toBe("snapshot");
  expect(value.meta.message).toContain(record.assessment.sources.weatherCapturedAt);
  expect(JSON.stringify(value)).not.toContain("private SQL");
});
it("suppresses all current categories exactly at the source freshness deadline", async () => {
  vi.setSystemTime(new Date(Date.parse(record.assessment.sources.weatherCapturedAt) + record.assessment.policy.weatherMaxAgeMs));
  const value = ExposureLayerSchema.parse(await (await readExposure(request())).json());
  expect(value.meta.state).toBe("stale");
  expect(value.meta.operationallyUsable).toBe(false);
  expect(value.data.segments.every((s) => s.windows.next24h.category === null)).toBe(true);
  expect(value.data.anchorAt).toBe(record.assessment.anchorAt);
});
it.each([
  "?horizonHours=6",
  "?extra=true",
  "?horizonHours=24&horizonHours=72",
  "?horizonHours=invalid",
  "?road=carretera",
  "?road=PE-22&road=PE-3N",
])("rejects invalid or ambiguous query %s before database work", async (query) => {
  expect((await readExposure(request(query))).status).toBe(400);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("fails safely when neither persistence nor its fallback is readable", async () => {
  mocks.read.mockRejectedValueOnce(new Error("private database detail"));
  vi.mocked(readBundledExposure).mockRejectedValueOnce(new Error("private bundle path"));
  const response = await readExposure(request());
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.error.code).toBe("exposure_unavailable");
  expect(JSON.stringify(body)).not.toContain("private");
});
it("rejects an incompatible geometry rather than displaying another revision", async () => {
  mocks.read.mockResolvedValueOnce({ ...record, assessment: { ...record.assessment, geometryRevision: "f".repeat(64) } });
  expect((await readExposure(request())).status).toBe(503);
});
it("serves a registered road from its own geometry revision", async () => {
  const road = await readBundledExposure("PE-16A");
  mocks.read.mockResolvedValueOnce(road);
  vi.setSystemTime(new Date(Date.parse(road.assessment.assessedAt) + 1000));
  const response = await readExposure(request("?road=PE-16A"));
  expect(response.status).toBe(200);
  expect(mocks.read).toHaveBeenCalledWith(road.assessment.geometryRevision);
  const value = ExposureLayerSchema.parse(await response.json());
  expect(value.data.segments.every((segment) => segment.segmentId.startsWith("PE-16A:"))).toBe(true);
});
it("answers that an unprepared road has no estimate instead of implying low risk", async () => {
  const response = await readExposure(request("?road=PE-99"));
  expect(response.status).toBe(404);
  expect((await response.json()).error.code).toBe("road_not_covered");
  expect(mocks.read).not.toHaveBeenCalled();
});
it("lists the forecast roads with the pilot first", async () => {
  const response = await readForecastRoads(new Request("https://example.test/api/exposure/roads"));
  const value = ForecastRoadsResponseSchema.parse(await response.json());
  expect(value.roads[0]).toMatchObject({ roadCode: "PE-22", pilot: true, geometryRevision: record.assessment.geometryRevision });
  expect(value.roads.map((road) => road.roadCode)).toContain("PE-16A");
});
