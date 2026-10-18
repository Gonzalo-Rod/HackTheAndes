import { expect, it, vi } from "vitest";
import { createAlertPassPayments } from "./alert-pass-payments";
const now = Date.parse("2026-10-18T04:00:00Z"),
  expiresAt = new Date(now + 168 * 3_600_000);
function setup(overrides: Record<string, unknown> = {}) {
  const repository = {
    claim: vi.fn(async () => ({
      id: "synthetic-request",
      status: "pending" as const,
      expiresAt,
      checkoutUrl: null,
      leaseUntil: null,
      active: false,
      leaseId: "synthetic-lease",
      url: null,
      ...overrides,
    })),
    save: vi.fn(async () => true),
    release: vi.fn(async () => {}),
  };
  const provider = { create: vi.fn(async () => "https://checkout.m.todaq.net/synthetic") };
  return { repository, provider, service: createAlertPassPayments({ repository, provider, now: () => now }) };
}
it("reuses a persisted link without another OpenAI request", async () => {
  const s = setup({ url: "https://checkout.m.todaq.net/saved", leaseId: null });
  const reply = await s.service.checkout("key", "trace");
  expect(reply).toContain("/saved");
  expect(reply).toContain("Pago único: USD 0,01");
  expect(s.provider.create).not.toHaveBeenCalled();
});
it.each([{ status: "cancelled" }, { status: "expired" }, { expiresAt: new Date(now) }])(
  "never creates checkout for unavailable requests: %j",
  async (state) => {
    const s = setup(state);
    expect(await s.service.checkout("key", "trace")).toContain("cancelada o expiró");
    expect(s.provider.create).not.toHaveBeenCalled();
  },
);
it("does not show a link if STOP won while checkout was being prepared", async () => {
  const s = setup();
  s.repository.save.mockResolvedValue(false);
  const reply = await s.service.checkout("key", "trace");
  expect(reply).toContain("cambió o expiró");
  expect(reply).not.toContain("https:");
});
it("returns a visible retry message and releases a failed checkout lease", async () => {
  const s = setup();
  s.provider.create.mockRejectedValue(new Error("unavailable"));
  expect(await s.service.checkout("key", "trace")).toContain("PAGAR para reintentar");
  expect(s.repository.release).toHaveBeenCalledWith("synthetic-request", "synthetic-lease");
});
it("reports paid status from stored access, without charging again", async () => {
  const s = setup({ status: "paid", active: true });
  expect(await s.service.checkout("key", "trace")).toContain("Qatom confirmó tu pago");
  expect(s.provider.create).not.toHaveBeenCalled();
});
