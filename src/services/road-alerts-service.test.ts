import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpstreamError } from "@/integrations/http/fetch-json";
import type { RoadAlertsProvider } from "@/integrations/sutran/sutran-client";
import { SUTRAN_ALERT_PE22, SUTRAN_ALERT_TUMBES } from "@/test/fixtures/sutran";

import { ALERTS_CACHE_TTL_MS, createRoadAlertsService, FORCED_REFRESH_MIN_AGE_MS } from "./road-alerts-service";

function fakeProvider(overrides: Partial<RoadAlertsProvider> = {}): RoadAlertsProvider {
  return {
    endpoint: "https://sutran.test/public/alerts",
    listAlerts: vi.fn(async () => ({ records: [SUTRAN_ALERT_TUMBES, SUTRAN_ALERT_PE22], invalidCount: 0 })),
    getAlertDetail: vi.fn(async () => ({ subcauseLabel: null, tags: [], evidence: [] })),
    getAlertHistory: vi.fn(async () => [{ fecha: "2026-10-17T15:21:32.269Z", tipo: "publicacion", estadoNuevo: null }]),
    ...overrides,
  };
}

const T0 = Date.parse("2026-10-17T18:00:00Z");

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => undefined));
afterEach(() => vi.restoreAllMocks());

describe("getCurrentAlerts", () => {
  it("normalizes alerts, newest action first", async () => {
    const service = createRoadAlertsService({ provider: fakeProvider(), now: () => T0 });
    const result = await service.getCurrentAlerts();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.alerts.map((a) => a.code)).toEqual(["SIGEA-171026-01", "SIGEA-250926-08"]);
    expect(result.value.meta).toMatchObject({ stale: false, latestActionAt: "2026-10-17T15:21:32.269Z", skippedCount: 0 });
  });

  it("serves from cache within the TTL and refetches after it", async () => {
    let now = T0;
    const provider = fakeProvider();
    const service = createRoadAlertsService({ provider, now: () => now });
    await service.getCurrentAlerts();
    now += ALERTS_CACHE_TTL_MS - 1;
    await service.getCurrentAlerts();
    expect(provider.listAlerts).toHaveBeenCalledTimes(1);
    now += 2;
    await service.getCurrentAlerts();
    expect(provider.listAlerts).toHaveBeenCalledTimes(2);
  });

  it("honors a forced refresh only when the cache is old enough", async () => {
    let now = T0;
    const provider = fakeProvider();
    const service = createRoadAlertsService({ provider, now: () => now });
    await service.getCurrentAlerts();
    now += FORCED_REFRESH_MIN_AGE_MS - 1;
    await service.getCurrentAlerts({ forceRefresh: true });
    expect(provider.listAlerts).toHaveBeenCalledTimes(1);
    now += 2;
    await service.getCurrentAlerts({ forceRefresh: true });
    expect(provider.listAlerts).toHaveBeenCalledTimes(2);
  });

  it("falls back to the last valid response, marked stale, when SUTRAN fails", async () => {
    let now = T0;
    const listAlerts = vi
      .fn<RoadAlertsProvider["listAlerts"]>()
      .mockResolvedValueOnce({ records: [SUTRAN_ALERT_PE22], invalidCount: 0 })
      .mockRejectedValueOnce(new UpstreamError("Sin respuesta en 8 s", "timeout", "sutran"));
    const service = createRoadAlertsService({ provider: fakeProvider({ listAlerts }), now: () => now });
    await service.getCurrentAlerts();
    now += ALERTS_CACHE_TTL_MS + 1;
    const result = await service.getCurrentAlerts();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.alerts).toHaveLength(1);
    expect(result.value.meta.stale).toBe(true);
    expect(result.value.meta.staleReason).toContain("Sin respuesta en 8 s");
    expect(result.value.meta.fetchedAt).toBe(new Date(T0).toISOString());
  });

  it("returns a typed error when SUTRAN fails and nothing is cached", async () => {
    const listAlerts = vi.fn(async () => {
      throw new UpstreamError("HTTP 503", "http", "sutran", 503);
    });
    const service = createRoadAlertsService({ provider: fakeProvider({ listAlerts }), now: () => T0 });
    await expect(service.getCurrentAlerts()).resolves.toEqual({
      ok: false,
      error: { code: "upstream_unavailable", message: "SUTRAN no respondió (HTTP 503)." },
    });
  });

  it("reports a changed response format as upstream_format", async () => {
    const listAlerts = vi.fn(async () => {
      throw new UpstreamError("Formato inesperado", "invalid_body", "sutran");
    });
    const service = createRoadAlertsService({ provider: fakeProvider({ listAlerts }), now: () => T0 });
    const result = await service.getCurrentAlerts();
    expect(result.ok ? null : result.error.code).toBe("upstream_format");
  });

  it("rethrows unexpected errors instead of hiding them", async () => {
    const listAlerts = vi.fn(async () => {
      throw new TypeError("bug");
    });
    const service = createRoadAlertsService({ provider: fakeProvider({ listAlerts }), now: () => T0 });
    await expect(service.getCurrentAlerts()).rejects.toThrow("Unexpected failure");
  });
});

describe("getAlertDetail", () => {
  it("returns the detail with history", async () => {
    const service = createRoadAlertsService({ provider: fakeProvider(), now: () => T0 });
    const result = await service.getAlertDetail(SUTRAN_ALERT_PE22.id);
    expect(result.ok && result.value.history).toHaveLength(1);
  });

  it("keeps the detail when only the history fails", async () => {
    const getAlertHistory = vi.fn(async () => {
      throw new UpstreamError("HTTP 500", "http", "sutran", 500);
    });
    const service = createRoadAlertsService({ provider: fakeProvider({ getAlertHistory }), now: () => T0 });
    const result = await service.getAlertDetail(SUTRAN_ALERT_PE22.id);
    expect(result).toMatchObject({ ok: true, value: { history: null } });
  });

  it("maps a missing alert to not_found", async () => {
    const getAlertDetail = vi.fn(async () => {
      throw new UpstreamError("HTTP 404", "http", "sutran", 404);
    });
    const service = createRoadAlertsService({ provider: fakeProvider({ getAlertDetail }), now: () => T0 });
    const result = await service.getAlertDetail("missing");
    expect(result.ok ? null : result.error.code).toBe("not_found");
  });
});

describe("concurrency", () => {
  it("shares one upstream call between concurrent detail requests", async () => {
    const provider = fakeProvider();
    const service = createRoadAlertsService({ provider, now: () => T0 });
    const [a, b] = await Promise.all([service.getAlertDetail(SUTRAN_ALERT_PE22.id), service.getAlertDetail(SUTRAN_ALERT_PE22.id)]);
    expect(a.ok && b.ok).toBe(true);
    expect(provider.getAlertDetail).toHaveBeenCalledTimes(1);
  });

  it("shares one upstream call between concurrent alert list requests", async () => {
    const provider = fakeProvider();
    const service = createRoadAlertsService({ provider, now: () => T0 });
    await Promise.all([service.getCurrentAlerts(), service.getCurrentAlerts(), service.getCurrentAlerts()]);
    expect(provider.listAlerts).toHaveBeenCalledTimes(1);
  });
});

describe("snapshot fallback", () => {
  const SNAPSHOT = { capturedAt: "2026-10-17T19:53:45.465Z", records: [SUTRAN_ALERT_PE22, SUTRAN_ALERT_TUMBES] };
  const failingList = () =>
    vi.fn(async () => {
      throw new UpstreamError("Sin respuesta en 8 s", "timeout", "sutran");
    });

  it("serves the snapshot, labeled with its capture time, when SUTRAN fails on a cold start", async () => {
    const service = createRoadAlertsService({ provider: fakeProvider({ listAlerts: failingList() }), snapshot: SNAPSHOT, now: () => T0 });
    const result = await service.getCurrentAlerts();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.alerts).toHaveLength(2);
    expect(result.value.meta).toMatchObject({ stale: true, fallback: "snapshot", fetchedAt: SNAPSHOT.capturedAt });
    expect(result.value.meta.staleReason).toContain("instantánea");
  });

  it("drops snapshot alerts whose validity ended before today in Lima", async () => {
    // 2026-11-01 00:30 in Lima: both fixtures were valid only until 2026-10-31.
    const afterValidity = Date.parse("2026-11-01T05:30:00Z");
    const service = createRoadAlertsService({ provider: fakeProvider({ listAlerts: failingList() }), snapshot: SNAPSHOT, now: () => afterValidity });
    const result = await service.getCurrentAlerts();
    expect(result.ok && result.value.alerts).toEqual([]);
    expect(result.ok && result.value.meta.skippedCount).toBe(2);
  });

  it("keeps alerts on their last valid day at 23:30 Lima time", async () => {
    const lastDayLate = Date.parse("2026-11-01T04:30:00Z"); // 2026-10-31 23:30 in Lima
    const service = createRoadAlertsService({ provider: fakeProvider({ listAlerts: failingList() }), snapshot: SNAPSHOT, now: () => lastDayLate });
    const result = await service.getCurrentAlerts();
    expect(result.ok && result.value.alerts).toHaveLength(2);
  });

  it("prefers the server cache over the snapshot", async () => {
    let now = T0;
    const listAlerts = vi
      .fn<RoadAlertsProvider["listAlerts"]>()
      .mockResolvedValueOnce({ records: [SUTRAN_ALERT_PE22], invalidCount: 0 })
      .mockRejectedValueOnce(new UpstreamError("HTTP 503", "http", "sutran", 503));
    const service = createRoadAlertsService({ provider: fakeProvider({ listAlerts }), snapshot: SNAPSHOT, now: () => now });
    await service.getCurrentAlerts();
    now += ALERTS_CACHE_TTL_MS + 1;
    const result = await service.getCurrentAlerts();
    expect(result.ok && result.value.meta.fallback).toBe("cache");
    expect(result.ok && result.value.alerts).toHaveLength(1);
  });

  it("marks fresh responses as not using a fallback", async () => {
    const service = createRoadAlertsService({ provider: fakeProvider(), snapshot: SNAPSHOT, now: () => T0 });
    const result = await service.getCurrentAlerts();
    expect(result.ok && result.value.meta.fallback).toBe("none");
  });
});
