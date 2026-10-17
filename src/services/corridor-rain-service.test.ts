import { describe, expect, it, vi } from "vitest";

import type { CorridorData } from "@/contracts/corridor";
import type { RainProvider } from "@/integrations/open-meteo/open-meteo-client";

import { createCorridorRainService, RAIN_CACHE_TTL_MS, RAIN_SAMPLE_COUNT } from "./corridor-rain-service";

const corridor = {
  road: "PE-22",
  name: "Carretera Central",
  kmTotal: 100,
  line: [
    [-77, -12, 0],
    [-76, -11, 100],
  ],
  segments: [],
  kmMarkers: [],
  places: [],
  profile: [
    { km: 0, elevationM: 100 },
    { km: 100, elevationM: 4000 },
  ],
  metadata: { retrievedAt: "x", geometry: "x", elevation: "x", places: "x", attribution: [] },
} as CorridorData;

const NOW = Date.parse("2026-10-17T12:00:00Z");
const nowSec = NOW / 1000;
const series = { timesSec: [nowSec - 3600, nowSec + 3600], precipitation: [1, 2] as (number | null)[] };

function setup(provider: RainProvider, clock: { t: number }) {
  return createCorridorRainService({ provider, loadCorridor: async () => corridor, now: () => clock.t });
}

describe("corridor rain service", () => {
  it("samples the corridor, splits the windows and caches the result", async () => {
    const fetchHourlyRain = vi.fn<RainProvider["fetchHourlyRain"]>(async (points) => points.map(() => series));
    const clock = { t: NOW };
    const service = setup({ fetchHourlyRain }, clock);
    const first = await service.getRain();
    expect(first.ok && first.value.samples).toHaveLength(RAIN_SAMPLE_COUNT);
    expect(first.ok && first.value.samples[0]).toMatchObject({ km: 0, pastMm: 1, nextMm: 2, elevationM: 100 });
    await service.getRain();
    expect(fetchHourlyRain).toHaveBeenCalledTimes(1);
  });

  it("serves the last good data flagged stale when the provider fails", async () => {
    const fetchHourlyRain = vi.fn<RainProvider["fetchHourlyRain"]>(async (points) => points.map(() => series));
    const clock = { t: NOW };
    const service = setup({ fetchHourlyRain }, clock);
    await service.getRain();
    fetchHourlyRain.mockRejectedValueOnce(new Error("boom"));
    clock.t += RAIN_CACHE_TTL_MS + 1;
    const result = await service.getRain();
    expect(result.ok && result.value.stale).toBe(true);
  });

  it("returns an error when the provider fails and nothing is cached", async () => {
    const service = setup({ fetchHourlyRain: vi.fn<RainProvider["fetchHourlyRain"]>().mockRejectedValue(new Error("boom")) }, { t: NOW });
    const result = await service.getRain();
    expect(result.ok).toBe(false);
  });
});
