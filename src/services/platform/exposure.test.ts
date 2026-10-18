import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { readBundledExposure } from "@peruroad/road-data/exposure";
import { ExposureLayerSchema } from "@/contracts/exposure";
import { readExposure } from "./exposure";
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
it("returns a validated public assessment with no writes, raw input bundle or automatic-alert activation", async () => {
  const response = await readExposure(request("?horizonHours=72"));
  expect(response.status).toBe(200);
  const value = ExposureLayerSchema.parse(await response.json());
  expect(value.meta).toMatchObject({ storage: "database", state: "ready", selectedHorizonHours: 72, automatedAlertUse: false });
  expect(value.data.segments).toHaveLength(174);
  expect(value.data.segments.some((s) => !s.catchmentIds.length && s.windows.next72h.category === null)).toBe(true);
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
it.each(["?horizonHours=6", "?extra=true", "?horizonHours=24&horizonHours=72", "?horizonHours=invalid"])(
  "rejects invalid or ambiguous query %s before database work",
  async (query) => {
    expect((await readExposure(request(query))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  },
);
it("fails safely when neither persistence nor its fallback is readable", async () => {
  mocks.read.mockRejectedValueOnce(new Error("private database detail"));
  vi.mocked(readBundledExposure).mockRejectedValueOnce(new Error("private bundle path"));
  const response = await readExposure(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: { code: "service_unavailable", message: "Servicio no disponible. Intenta más tarde." } });
});
it("rejects an incompatible geometry rather than displaying another revision", async () => {
  mocks.read.mockResolvedValueOnce({ ...record, assessment: { ...record.assessment, geometryRevision: "f".repeat(64) } });
  expect((await readExposure(request())).status).toBe(503);
});
