import { it, expect } from "vitest";
import { capturedExposure } from "./support.ts";
import { refreshExposureWeather } from "../../src/services/refresh-exposure.ts";
import { createExposureView } from "../../src/domain/exposure/view.ts";
it("refreshes only weather, preserves spatial provenance and replays the new assessment", async () => {
  const { record } = await capturedExposure();
  const at = new Date(Date.parse(record.assessment.assessedAt) + 1000);
  const refreshed = await refreshExposureWeather(
    record,
    {
      fetchWeather: async () => ({
        sourceUrls: record.input.weather.sourceUrls,
        series: record.input.weather.grids,
      }),
    },
    "test",
    () => at,
  );
  expect(refreshed.assessment.assessmentId).not.toBe(record.assessment.assessmentId);
  expect(refreshed.input.sourceHashes.hazards).toBe(record.input.sourceHashes.hazards);
  expect(refreshed.input.weather.capturedAt).toBe(at.toISOString());
  expect(
    createExposureView(refreshed.assessment, at.getTime(), "database", 24, true).meta
      .automatedAlertUse,
  ).toBe(true);
  expect(
    createExposureView(refreshed.assessment, at.getTime(), "snapshot", 24, true).meta
      .automatedAlertUse,
  ).toBe(false);
  expect(
    createExposureView(
      refreshed.assessment,
      at.getTime() + refreshed.assessment.policy.weatherMaxAgeMs,
      "database",
      24,
      true,
    ).meta.automatedAlertUse,
  ).toBe(false);
});
it("rejects a missing or relocated weather grid without replacing a valid assessment", async () => {
  const { record } = await capturedExposure();
  await expect(
    refreshExposureWeather(
      record,
      { fetchWeather: async () => ({ sourceUrls: [], series: [] }) },
      "test",
      () => new Date(),
    ),
  ).rejects.toThrow("grid plan");
});
