import { expect, it, vi } from "vitest";
import type { RoadContextRequest, RoadContextResponse } from "@peruroad/road-data/context/contracts";
import type { RouteDraft } from "@/contracts/route-subscriptions";
import { createSubscriptionFlow } from "./subscription-flow";
import type { SubscriptionRepository } from "@/db/subscriptions";
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
  const flow = createSubscriptionFlow({
    repository,
    context,
    revision,
    now: () => now,
    newId,
    pepper: "synthetic-pepper",
    teamKeys: [],
    testKeys: [],
  });
  return { repository, context, flow, draft: () => draft };
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
