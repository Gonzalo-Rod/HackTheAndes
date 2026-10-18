import { it, expect, vi } from "vitest";
import { createSubscriptionFlow } from "./subscription-flow";
import type { SubscriptionRepository } from "@/db/subscriptions";
const revision = "a".repeat(64),
  now = Date.parse("2026-10-18T03:00:00Z");
function setup() {
  const repository: SubscriptionRepository = {
    routeState: vi.fn(async () => ({ reply: null, draft: null })),
    bounds: vi.fn(async () => ({ startKm: 0, endKm: 174 })),
    touch: vi.fn(async () => {}),
    act: vi.fn(async (input) => input.action.kind),
  };
  const context = vi.fn(async () => {
    throw new Error("Unavailable");
  });
  return {
    repository,
    context,
    flow: createSubscriptionFlow({
      repository,
      context,
      revision,
      pepper: "synthetic-pepper",
      teamKeys: [],
      testKeys: [],
      now: () => now,
      newId: () => "abcdef12-0000-4000-8000-000000000000",
    }),
  };
}
const message = (text: string) => ({ messageId: "synthetic", from: "US.synthetic", messageType: "text", channel: "whatsapp", text });
it("asks for explicit authorization before a whole-corridor opt-in", async () => {
  const s = setup();
  await s.flow.handle(message("SUSCRIBIR PRUEBA"), "r");
  expect(s.repository.act).toHaveBeenCalledWith(
    expect.objectContaining({ action: expect.objectContaining({ kind: "prepare", isTest: true, code: "ABCDEF12" }) }),
  );
});
it("does not silently replace an unresolved requested stretch with the whole road", async () => {
  const s = setup();
  expect(await s.flow.handle(message("SUSCRIBIR Chosica–La Oroya"), "r")).toContain("No pude verificar");
  expect(s.repository.act).not.toHaveBeenCalled();
});
it("requires two endpoints instead of guessing a requested place", async () =>
  expect(await setup().flow.handle(message("SUSCRIBIR Chosica"), "r")).toContain("dos lugares"));
it("BAJA is deterministic and does not call the LLM or location service", async () => {
  const s = setup();
  await s.flow.handle(message("BAJA"), "r");
  expect(s.context).not.toHaveBeenCalled();
  expect(s.repository.act).toHaveBeenCalledWith(expect.objectContaining({ action: { kind: "stop" } }));
});
it("accepts the exact typed activation code", async () => {
  const s = setup();
  await s.flow.handle(message("ACTIVAR ABCDEF12"), "r");
  expect(s.repository.act).toHaveBeenCalledWith(expect.objectContaining({ action: { kind: "activate", code: "ABCDEF12" } }));
});
it("preserves report/query messages for their existing handlers", async () =>
  expect(await setup().flow.handle(message("REPORTE derrumbe"), "r")).toBeNull());
it("recognizes the seven-day command without treating the duration as a place", async () => {
  const s = setup();
  await s.flow.handle(message("SUSCRIBIR 7 DIAS"), "r");
  expect(s.context).not.toHaveBeenCalled();
  expect(s.repository.act).toHaveBeenCalledWith(expect.objectContaining({ action: expect.objectContaining({ kind: "prepare" }) }));
});
it("anchors a request to the provider message time instead of delayed processing", async () => {
  const s = setup();
  await s.flow.handle({ ...message("SUSCRIBIR 7 DIAS"), providerTimestamp: now - 60_000 }, "r");
  expect(s.repository.act).toHaveBeenCalledWith(
    expect.objectContaining({ action: expect.objectContaining({ requestedAt: new Date(now - 60_000).toISOString() }) }),
  );
});
