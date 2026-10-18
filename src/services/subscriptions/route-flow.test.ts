import { describe, expect, it, vi } from "vitest";
import type { RoadContextRequest, RoadContextResponse } from "@peruroad/road-data/context/contracts";
import type { RouteDraft } from "@/contracts/route-subscriptions";
import { createSubscriptionFlow } from "./subscription-flow";
import type { SubscriptionRepository } from "@/db/subscriptions";
import type { RouteRoads } from "./route-flow";
const revision = "a".repeat(64),
  now = Date.parse("2026-10-18T04:00:00Z");
const newId = () => "abcdef12-0000-4000-8000-000000000000";
const message = (text: string) => ({
  messageId: text || "synthetic-pin",
  from: "US.synthetic-route",
  messageType: "text",
  channel: "whatsapp",
  text,
});
function setup() {
  let draft: RouteDraft | null = null;
  const repository: SubscriptionRepository = {
    bounds: vi.fn(async () => ({ startKm: 0, endKm: 174 })),
    touch: vi.fn(async () => {}),
    routeState: vi.fn(async () => ({ draft, reply: null })),
    act: vi.fn(async ({ action }) => {
      if (action.kind === "routeStart") draft = action.draft;
      if (action.kind === "routeOrigin" && draft) draft = { ...draft, origin: action.endpoint };
      return action.kind;
    }),
  };
  const context = vi.fn<(input: RoadContextRequest, requestId: string) => Promise<RoadContextResponse>>(async () => ({
    kind: "location" as const,
    state: "ready" as const,
    status: "matched" as const,
    servedAt: new Date(now).toISOString(),
    asOf: new Date(now).toISOString(),
    dataAgeMs: 0,
    message: "Synthetic matched pin",
    candidates: [],
    requiresConfirmation: true,
    location: {
      geometryRevision: revision,
      segmentId: "synthetic-segment",
      snappedPosition: [-76.5, -11.8],
      distanceFromOriginKm: 25,
      distanceFromRoadM: 40,
    },
  }));
  const payments = { checkout: vi.fn(async () => null) };
  const flow = createSubscriptionFlow({
    repository,
    context,
    revision,
    now: () => now,
    newId,
    pepper: "synthetic-pepper",
    teamKeys: [],
    testKeys: [],
    payments,
  });
  return { repository, context, payments, flow, draft: () => draft };
}
it("asks for origin and destination then proposes a reverse-direction route without activating", async () => {
  const s = setup();
  await s.flow.handle(message("RUTA PRUEBA"), "r");
  expect(s.draft()?.isTest).toBe(true);
  await s.flow.handle(message("KM 50,5"), "r");
  await s.flow.handle(message("DESTINO KM 10.25"), "r");
  expect(s.repository.act).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: expect.objectContaining({
        kind: "routeDestination",
        code: "ABCDEF12",
        range: expect.objectContaining({ startKm: 10.25, endKm: 50.5, geometryRevision: revision }),
      }),
    }),
  );
  expect(s.context).not.toHaveBeenCalled();
});
it("snaps a shared pin only during an active route proposal, never storing raw coordinates", async () => {
  const s = setup();
  const pin = { ...message(""), messageType: "location", content: { latitude: -11.8, longitude: -76.5 } };
  expect(await s.flow.handle(pin, "r")).toBeNull();
  await s.flow.handle(message("RUTA"), "r");
  await s.flow.handle(pin, "r");
  expect(s.context).toHaveBeenCalledWith({ kind: "pin", latitude: -11.8, longitude: -76.5 }, "r");
  expect(s.draft()?.origin).toEqual({ distanceKm: 25, label: "Km 25.0 del mapa", geometryRevision: revision });
});
it("rejects an out-of-corridor pin, unknown place, identical endpoint and out-of-range km without broadening", async () => {
  const s = setup();
  await s.flow.handle(message("RUTA"), "r");
  const matched = await s.context({ kind: "place", name: "Synthetic place" }, "r");
  if (matched.kind !== "location") throw new Error("Expected location fixture");
  vi.mocked(s.context).mockResolvedValue({ ...matched, status: "outside_corridor", location: null });
  expect(await s.flow.handle(message("Unknown place"), "r")).toContain("No pude ubicar");
  expect(s.draft()?.origin).toBeNull();
  expect(await s.flow.handle(message("KM 175"), "r")).toContain("Solo cubrimos");
  await s.flow.handle(message("KM 20"), "r");
  expect(await s.flow.handle(message("KM 20"), "r")).toContain("distintos");
  expect(s.repository.act).not.toHaveBeenCalledWith(
    expect.objectContaining({ action: expect.objectContaining({ kind: "routeDestination" }) }),
  );
});
it("keeps query/report commands separate and honors STOP during a pending route", async () => {
  const s = setup();
  await s.flow.handle(message("RUTA"), "r");
  expect(await s.flow.handle(message("REPORTE derrumbe"), "r")).toContain("Termínala");
  expect(await s.flow.handle(message("ESTADO"), "r")).toBeNull();
  await s.flow.handle(message("STOP"), "r");
  expect(s.repository.act).toHaveBeenLastCalledWith(expect.objectContaining({ action: { kind: "stop" } }));
  await s.flow.handle(message("RUTA CANCELAR"), "r");
  expect(s.repository.act).toHaveBeenLastCalledWith(expect.objectContaining({ action: { kind: "routeCancel" } }));
});
it("returns a durable replay before interpreting the same pin as the next endpoint", async () => {
  const s = setup();
  vi.mocked(s.repository.routeState).mockResolvedValue({ reply: "Synthetic replay", draft: null });
  expect(await s.flow.handle(message("KM 50"), "r")).toBe("Synthetic replay");
  expect(s.repository.act).not.toHaveBeenCalled();
});
it("shows a visible fallback when route lookup is unavailable", async () => {
  const s = setup();
  vi.mocked(s.repository.routeState).mockRejectedValue(new Error("Unavailable"));
  expect(await s.flow.handle(message("RUTA"), "r")).toContain("No cambió tu suscripción");
  expect(s.repository.act).not.toHaveBeenCalled();
});
it("confirms a route through its own command without preparing another checkout", async () => {
  const s = setup();
  await s.flow.handle(message("RUTA ACTIVAR ABCDEF12"), "r");
  expect(s.repository.act).toHaveBeenLastCalledWith(expect.objectContaining({ action: { kind: "routeActivate", code: "ABCDEF12" } }));
  expect(s.repository.act).not.toHaveBeenCalledWith(expect.objectContaining({ action: expect.objectContaining({ kind: "activate" }) }));
  expect(s.payments.checkout).not.toHaveBeenCalled();
});

describe("national routes", () => {
  const otherRevision = "b".repeat(64);
  function nationalSetup() {
    let draft: RouteDraft | null = null;
    const repository: SubscriptionRepository = {
      bounds: vi.fn(async (rev: string) => (rev === otherRevision ? { startKm: 0, endKm: 291.8 } : { startKm: 0, endKm: 174 })),
      touch: vi.fn(async () => {}),
      routeState: vi.fn(async () => ({ draft, reply: null })),
      act: vi.fn(async ({ action }) => {
        if (action.kind === "routeStart") draft = action.draft;
        if (action.kind === "routeRoad" && draft) draft = { ...draft, road: action.road };
        if (action.kind === "routeOrigin" && draft) draft = { ...draft, road: action.road ?? draft.road ?? null, origin: action.endpoint };
        return "prompt" in action && action.prompt ? action.prompt : action.kind;
      }),
    };
    const base = setup();
    const roads = [
      { roadCode: "PE-22", name: "Carretera Central", geometryRevision: revision, measuredLengthKm: 174, pilot: true },
      { roadCode: "PE-32", name: "Carretera PE-32", geometryRevision: otherRevision, measuredLengthKm: 291.8, pilot: false },
    ];
    const locate = vi.fn<RouteRoads["locate"]>(async () => null);
    const flow = createSubscriptionFlow({
      repository,
      context: base.context,
      revision,
      now: () => now,
      newId,
      pepper: "synthetic-pepper",
      teamKeys: [],
      testKeys: [],
      national: { roads: async () => roads, locate },
    });
    return { repository, context: base.context, locate, flow, draft: () => draft };
  }
  const pin = (latitude: number, longitude: number) => ({
    ...message(""),
    messageId: `pin-${latitude}`,
    messageType: "location",
    content: { latitude, longitude },
  });

  it("asks for the road first, then the road code scopes the following km steps", async () => {
    const s = nationalSetup();
    expect(await s.flow.handle(message("RUTA"), "r")).toContain("¿Por qué carretera viajas?");
    expect(await s.flow.handle(message("KM 10"), "r")).toContain("Primero elige la carretera");
    expect(await s.flow.handle(message("PE-32"), "r")).toContain("Carretera PE-32");
    expect(s.draft()?.road).toEqual({ roadCode: "PE-32", geometryRevision: otherRevision });
    expect(await s.flow.handle(message("KM 250"), "r")).toContain("en PE-32");
    await s.flow.handle(message("KM 20"), "r");
    expect(s.repository.act).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          kind: "routeDestination",
          range: expect.objectContaining({
            startKm: 20,
            endKm: 250,
            geometryRevision: otherRevision,
            roadCode: "PE-32",
            label: expect.stringMatching(/^PE-32: /),
          }),
        }),
      }),
    );
  });

  it("accepts RUTA PE-32 in one message and checks km against that road", async () => {
    const s = nationalSetup();
    await s.flow.handle(message("RUTA PE-32"), "r");
    expect(s.draft()?.road?.roadCode).toBe("PE-32");
    expect(await s.flow.handle(message("KM 280"), "r")).toContain("Km 280.0 del mapa");
    expect(await s.flow.handle(message("KM 300"), "r")).toContain("Solo cubrimos km aprox. 0.0–291.8 del mapa PE-32");
  });

  it("rejects roads without an estimate and lists the available ones", async () => {
    const s = nationalSetup();
    expect(await s.flow.handle(message("RUTA PE-1N"), "r")).toContain(
      "PE-1N aún no está disponible para rutas. Carreteras disponibles: PE-22, PE-32",
    );
    expect(s.repository.act).not.toHaveBeenCalled();
  });

  it("detects the road from the first pin and keeps the destination on it", async () => {
    const s = nationalSetup();
    vi.mocked(s.context).mockResolvedValue({
      ...(await s.context({ kind: "pin", latitude: 0, longitude: 0 }, "r")),
      status: "outside_corridor",
      location: null,
    } as RoadContextResponse);
    s.locate.mockResolvedValue({
      roadCode: "PE-32",
      geometryRevision: otherRevision,
      segmentId: "s",
      distanceFromOriginKm: 3,
      distanceFromRoadM: 80,
    });
    await s.flow.handle(message("RUTA"), "r");
    await s.flow.handle(pin(-15.874, -74.148), "r");
    expect(s.locate).toHaveBeenLastCalledWith({ latitude: -15.874, longitude: -74.148 }, [otherRevision]);
    expect(s.draft()?.road?.roadCode).toBe("PE-32");
    expect(await s.flow.handle(message("Chosica"), "r")).toContain("catálogo de lugares cubre solo PE-22");
    s.locate.mockResolvedValue(null);
    expect(await s.flow.handle(pin(-12, -76), "r")).toContain("No pude ubicar ese pin sobre PE-32");
  });

  it("does not switch roads after the origin is set", async () => {
    const s = nationalSetup();
    await s.flow.handle(message("RUTA PE-32"), "r");
    await s.flow.handle(message("KM 5"), "r");
    expect(await s.flow.handle(message("PE-22"), "r")).toContain("Ya elegiste el origen en PE-32");
  });
});
