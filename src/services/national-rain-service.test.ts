import { describe, expect, it, vi } from "vitest";
import type { RainProvider } from "@/integrations/open-meteo/open-meteo-client";
import { createNationalRainService, NATIONAL_RAIN_CACHE_TTL_MS } from "./national-rain-service";

const NOW = Date.parse("2026-10-18T06:30:00Z");
const hourSec = Math.floor(NOW / 3_600_000) * 3600;
// 24 past hours at 0.5 mm, the current hour, then 24 future hours at 1 mm.
const timesSec = Array.from({ length: 49 }, (_, i) => hourSec + (i - 24) * 3600);
const full = { timesSec, precipitation: timesSec.map((t) => (t <= hourSec ? 0.5 : 1)) };

function setup(fetchHourlyRain: RainProvider["fetchHourlyRain"]) {
  let now = NOW;
  const provider = { fetchHourlyRain: vi.fn(fetchHourlyRain) };
  const centers = Array.from({ length: 150 }, (_, i): [number, number] => [-77 + i * 0.01, -12]);
  const service = createNationalRainService({
    provider,
    grid: { stepDeg: 0.75, centers, displayStepDeg: 0.25, displayCenters: [[-76.5, -12]] },
    now: () => now,
  });
  return { service, provider, advance: (ms: number) => (now += ms) };
}

describe("national rain service", () => {
  it("batches grid cells, sums 24 h windows and caches for an hour", async () => {
    const { service, provider, advance } = setup(async (points) => points.map(() => full));
    const result = await service.getRain("r");
    if (!result.ok) throw new Error("expected rain");
    expect(provider.fetchHourlyRain).toHaveBeenCalledTimes(2);
    expect(result.value.cells).toHaveLength(150);
    expect(result.value.cells[0]).toMatchObject({ nextMm: 24 });
    expect(result.value.display).toMatchObject({ stepDeg: 0.25, cells: [{ lng: -76.5, nextMm: 24 }] });
    advance(NATIONAL_RAIN_CACHE_TTL_MS - 1);
    await service.getRain("r");
    expect(provider.fetchHourlyRain).toHaveBeenCalledTimes(2);
  });

  it("omits cells with incomplete hours instead of showing them as dry", async () => {
    const gap = { timesSec, precipitation: full.precipitation.map((v, i) => (i === 30 ? null : v)) };
    const { service } = setup(async (points) => points.map((_, i) => (i === 0 ? gap : full)));
    const result = await service.getRain("r");
    if (!result.ok) throw new Error("expected rain");
    expect(result.value.missingCells).toBe(2);
    expect(result.value.cells).toHaveLength(148);
  });

  it("serves the last result as stale on failure, or a safe error without one", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let fail = false;
    const { service, advance } = setup(async (points) => {
      if (fail) throw new Error("timeout");
      return points.map(() => full);
    });
    await service.getRain("r");
    fail = true;
    advance(NATIONAL_RAIN_CACHE_TTL_MS + 1);
    const stale = await service.getRain("r");
    expect(stale.ok && stale.value.stale).toBe(true);

    const cold = setup(async () => {
      throw new Error("timeout");
    });
    expect(await cold.service.getRain("r")).toMatchObject({ ok: false, error: { code: "upstream_unavailable" } });
  });
});
