import { beforeEach, expect, it, vi } from "vitest";
import { CatchmentWeatherLayerSchema, HazardLayerSchema } from "@/contracts/model-inputs";
import { historicalEventsSchema } from "@peruroad/road-data/model-inputs/event-contracts";
import { weatherCaptureSchema } from "@peruroad/road-data/weather/contracts";
import { readBundledHazards } from "@peruroad/road-data/model-inputs";
import { readBundledWeather } from "@peruroad/road-data/weather";
import { readCatchmentRain, readHazardInputs, readEventHistory, readWeatherHistory } from "./data-inputs";

const mocks = vi.hoisted(() => ({ hazards: vi.fn(), events: vi.fn(), weather: vi.fn() }));
vi.mock("@/db/model-inputs", () => ({ readHazards: mocks.hazards, readHistoricalEvents: mocks.events, readWeather: mocks.weather }));
vi.mock("@peruroad/road-data/model-inputs", async (original) => {
  const actual = await original<typeof import("@peruroad/road-data/model-inputs")>();
  return { ...actual, readBundledHazards: vi.fn(actual.readBundledHazards) };
});
const request = (path: string) => new Request(`https://example.test${path}`);
beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mocks).forEach((mock) => mock.mockRejectedValue(new Error("private SQL detail")));
});

it("serves the original weather windows and their age during a database outage", async () => {
  const source = await readBundledWeather("live.json.gz");
  const response = await readCatchmentRain(request("/api/weather/catchments"));
  const value = CatchmentWeatherLayerSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(value.meta.state).toBe("snapshot");
  expect(value.meta.capturedAt).toBe(source.capturedAt);
  expect(value.meta.message).toContain(source.capturedAt);
  expect(value.data.anchorAt).toBe(new Date(Math.floor(Date.parse(source.capturedAt) / 3_600_000) * 3_600_000).toISOString());
  expect(value.data.forecastIssuedAt).toBeNull();
  expect(value.data.catchments.every((c) => c.sixHourForecasts.length === 12)).toBe(true);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(JSON.stringify(value)).not.toContain("private SQL detail");
});
it("retains validated static and official context when the database is unavailable", async () => {
  const response = await readHazardInputs(request("/api/hazards"));
  const value = HazardLayerSchema.parse(await response.json());
  expect(value.meta.state).toBe("snapshot");
  expect(value.data.susceptibility.features.length).toBeGreaterThan(0);
  expect(value.data.susceptibility.historicalEligibility).toBe("unverified");
  expect(value.data.warnings.features.every((f) => !f.properties.automatedRiskUse)).toBe(true);
});
it("never turns incomplete event history into negative training labels", async () => {
  const response = await readEventHistory(request("/api/history/events"));
  const value = await response.json();
  const data = historicalEventsSchema.parse(value.data);
  expect(value.meta.state).toBe("snapshot");
  expect(data.negativeExamples).toBe(0);
  expect(data.trainingReady).toBe(false);
  expect(data.events.some((event) => event.timePrecision === "conflicting_hours")).toBe(true);
});
it.each(["yaku-2023", "forecast-2024", "forecast-2025", "reference-2024", "reference-2025"])(
  "serves the bundled %s archive without provider calls",
  async (dataset) => {
    const response = await readWeatherHistory(request(`/api/history/weather?dataset=${dataset}`));
    expect(response.status).toBe(200);
    const value = await response.json();
    const data = weatherCaptureSchema.parse(value.data);
    expect(value.meta.state).toBe("snapshot");
    expect(data.forecastIssuedAt).toBeNull();
    expect(data.kind).toBe(dataset.startsWith("forecast-") ? "previous_runs" : "reanalysis");
  },
);
it("rejects unlisted archives and reports unavailable if both persistence and the bundle fail", async () => {
  const invalid = await readWeatherHistory(request("/api/history/weather?dataset=../../.env.local"));
  expect(invalid.status).toBe(400);
  expect(mocks.weather).not.toHaveBeenCalled();
  vi.mocked(readBundledHazards).mockRejectedValueOnce(new Error("private bundle path"));
  const response = await readHazardInputs(request("/api/hazards"));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: { code: "service_unavailable", message: "Servicio no disponible. Intenta más tarde." } });
});
