import { it, expect, vi } from "vitest";
import { createAlertDispatcher } from "./deliver-alerts";
import type { AlertDeliveryRepository } from "@/db/alert-deliveries";
const record = {
  id: "synthetic-delivery",
  subscriptionId: "synthetic-sub",
  leaseId: "synthetic-lease",
  body: "SUTRAN: interrumpido. BAJA cancela.",
  checkpoint: {},
  expiresAt: new Date(Date.now() + 60000),
  consentAt: new Date(),
};
function setup(windowOpen = true) {
  const repository: AlertDeliveryRepository = {
    activeRevisions: vi.fn(async () => []),
    subscriptions: vi.fn(async () => ["synthetic-sub"]),
    claim: vi.fn(async () => record),
    destination: vi.fn(async () => ({ to: "US.synthetic", windowOpen })),
    finish: vi.fn(async () => {}),
  };
  const messaging = { sendText: vi.fn(async () => ({ ok: true as const, value: { providerMessageId: "synthetic" } })) };
  const templates = { sendTemplate: vi.fn(async () => ({ ok: true as const, value: { providerMessageId: "synthetic-template" } })) };
  return {
    repository,
    messaging,
    templates,
    run: createAlertDispatcher({ repository, messaging, templates, revision: "a".repeat(64), now: Date.now }),
  };
}
it("uses text inside the service window with a durable delivery key", async () => {
  const s = setup();
  expect((await s.run([], "r")).sent).toBe(1);
  expect(s.messaging.sendText).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "alert:v1:synthetic-delivery:text" }));
  expect(s.templates.sendTemplate).not.toHaveBeenCalled();
});
it("uses only the approved-template adapter outside the service window", async () => {
  const s = setup(false);
  expect((await s.run([], "r")).sent).toBe(1);
  expect(s.messaging.sendText).not.toHaveBeenCalled();
  expect(s.templates.sendTemplate).toHaveBeenCalledOnce();
});
it("rechecks consent before the provider call", async () => {
  const s = setup();
  vi.mocked(s.repository.destination).mockResolvedValue(null);
  expect((await s.run([], "r")).sent).toBe(0);
  expect(s.messaging.sendText).not.toHaveBeenCalled();
});
