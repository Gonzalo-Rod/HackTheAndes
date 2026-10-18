import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredTrip } from "@/db/trips";
import type { MessagingProvider, VoiceCaller } from "@/integrations/messaging/types";
import type { WatchIncident } from "./collect-incidents";
import { createRouteWatchEvaluator, TRIP_COMPLETION_GRACE_MS, type RouteWatchDeps } from "./evaluate";

const NOW = Date.parse("2026-10-18T05:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const trip: StoredTrip = {
  id: "trip-1",
  destination: "+51900000000",
  originKm: 10,
  destinationKm: 170,
  departAt: minutesAgo(60),
  avgSpeedKmh: 40,
  status: "active",
  isTest: false,
};
const huaico: WatchIncident = {
  key: "community:11111111-1111-4111-8111-111111111111",
  incidentId: "11111111-1111-4111-8111-111111111111",
  source: "community",
  type: "huaico",
  roadStatus: "interrumpido",
  startKm: 75,
  endKm: 76,
  observedAt: minutesAgo(10),
  corroborated: true,
  isTest: false,
};

function setup(overrides: { trips?: StoredTrip[]; incidents?: WatchIncident[]; called?: string[]; voice?: VoiceCaller } = {}) {
  const trips = {
    watched: vi.fn(async () => overrides.trips ?? [trip]),
    setStatus: vi.fn(async () => undefined),
    calledIncidentKeys: vi.fn(async () => new Set(overrides.called ?? [])),
    recordCall: vi.fn(async () => undefined),
  };
  const voice = overrides.voice ?? {
    placeTextToSpeechCall: vi.fn(async () => ({ ok: true as const, value: { providerMessageId: "msg_call" } })),
  };
  const messaging: MessagingProvider = { sendText: vi.fn(async () => ({ ok: false as const, error: "window_closed" as const })) };
  const deps: RouteWatchDeps = {
    trips,
    testPhoneKeys: [],
    loadIncidents: async () => ({ incidents: overrides.incidents ?? [huaico], officialState: "ready" }),
    landmarks: async () => [{ name: "MATUCANA", kind: "bridge", distanceKm: 75.4 }],
    voice,
    messaging,
    now: () => NOW,
  };
  return { evaluate: createRouteWatchEvaluator(deps), trips, voice, messaging };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("route watch evaluation", () => {
  it("calls the monitor about an urgent incident ahead and records it", async () => {
    const { evaluate, trips, voice, messaging } = setup();
    const result = await evaluate("req-1");

    expect(result.trips[0]).toMatchObject({ state: "called", calledIncidentKey: huaico.key, providerCallId: "msg_call" });
    const call = vi.mocked(voice.placeTextToSpeechCall).mock.calls[0]?.[0];
    if (!call) throw new Error("Expected a call");
    expect(call).toMatchObject({ to: trip.destination, language: "es-ES", idempotencyKey: `route-watch:trip-1:${huaico.key}` });
    expect(call.text).toContain("un huaico en un reporte de la comunidad aún no confirmado");
    expect(call.text).toContain("cerca del puente MATUCANA");
    expect(trips.recordCall).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: "trip-1", incidentKey: huaico.key, incidentId: huaico.incidentId, providerCallId: "msg_call" }),
    );
    expect(messaging.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "whatsapp", idempotencyKey: `route-watch:trip-1:${huaico.key}:whatsapp` }),
    );
  });

  it("does not call twice about the same incident", async () => {
    const { evaluate, voice } = setup({ called: [huaico.key] });
    expect((await evaluate("req-1")).trips[0]?.state).toBe("no_urgent_incident");
    expect(voice.placeTextToSpeechCall).not.toHaveBeenCalled();
  });

  it("places at most one call per trip per run, the highest-ranked first", async () => {
    const closure = {
      ...huaico,
      key: "sutran:2",
      incidentId: null,
      source: "official" as const,
      type: "bloqueo" as const,
      startKm: 120,
      endKm: 120,
    };
    const { evaluate, voice } = setup({ incidents: [closure, huaico] });
    expect((await evaluate("req-1")).trips[0]?.calledIncidentKey).toBe(huaico.key);
    expect(voice.placeTextToSpeechCall).toHaveBeenCalledTimes(1);
  });

  it("reports a failed call without recording it, so the next run retries", async () => {
    const voice: VoiceCaller = { placeTextToSpeechCall: vi.fn(async () => ({ ok: false as const, error: "rate_limited" as const })) };
    const { evaluate, trips } = setup({ voice });
    expect((await evaluate("req-1")).trips[0]).toMatchObject({ state: "call_failed", error: "rate_limited" });
    expect(trips.recordCall).not.toHaveBeenCalled();
  });

  it("waits for departure and activates planned trips once departed", async () => {
    const future = { ...trip, status: "planned" as const, departAt: new Date(NOW + 60_000).toISOString() };
    const planned = { ...trip, id: "trip-2", status: "planned" as const };
    const { evaluate, trips } = setup({ trips: [future, planned] });
    const result = await evaluate("req-1");
    expect(result.trips.map((item) => item.state)).toEqual(["not_departed", "called"]);
    expect(trips.setStatus).toHaveBeenCalledWith("trip-2", "active");
  });

  it("completes trips well past their estimated arrival", async () => {
    // 160 km at 40 km/h is 4 h; add the grace period and a minute.
    const late = { ...trip, departAt: new Date(NOW - 4 * 3_600_000 - TRIP_COMPLETION_GRACE_MS - 60_000).toISOString() };
    const { evaluate, trips, voice } = setup({ trips: [late] });
    expect((await evaluate("req-1")).trips[0]?.state).toBe("completed");
    expect(trips.setStatus).toHaveBeenCalledWith("trip-1", "completed");
    expect(voice.placeTextToSpeechCall).not.toHaveBeenCalled();
  });

  it("ranks without calling or changing trips in rank-only mode", async () => {
    const { evaluate, trips, voice } = setup({ trips: [{ ...trip, status: "planned" }] });
    expect((await evaluate("req-1", { rankOnly: true })).trips[0]).toMatchObject({ state: "would_call", calledIncidentKey: huaico.key });
    expect(voice.placeTextToSpeechCall).not.toHaveBeenCalled();
    expect(trips.setStatus).not.toHaveBeenCalled();
    expect(trips.recordCall).not.toHaveBeenCalled();
  });

  it("evaluates only the requested trip", async () => {
    const { evaluate } = setup({ trips: [trip, { ...trip, id: "trip-2" }] });
    expect((await evaluate("req-1", { tripId: "trip-2" })).trips.map((item) => item.tripId)).toEqual(["trip-2"]);
  });
});
