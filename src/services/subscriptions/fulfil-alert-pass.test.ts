import { expect, it, vi } from "vitest";
import { createAlertPassHandler } from "./fulfil-alert-pass";
import type { SettledPurchase } from "@/contracts/alert-passes";
const transactionId = "b2b0d2c6-1f4e-4a90-9a1e-2c9a4a7f0f11";
function setup() {
  const purchase = vi.fn(async (): Promise<SettledPurchase> => ({
    transaction_id: transactionId,
    catalog_item_id: 123,
    amount: "0.01",
    dq: "synthetic",
    settled_at: "2026-10-18T04:00:00Z",
    dispatch_status: "pending",
  }));
  const fulfil = vi.fn(async () => ({ ok: true }));
  return { purchase, fulfil, handle: createAlertPassHandler({ token: "synthetic-token", purchase, fulfil, now: () => 1000 }) };
}
function request(auth: string | null = "Bearer synthetic-token", input: unknown = { request_id: transactionId }) {
  return new Request("https://example.test/api/qatom/alert-pass", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Qatom-Transaction-Id": transactionId,
      ...(auth === null ? {} : { Authorization: auth }),
    },
    body: JSON.stringify(input),
  });
}
it.each([null, "Bearer wrong"])("rejects missing or wrong fulfilment credentials before processing", async (auth) => {
  const s = setup();
  expect((await s.handle(request(auth))).status).toBe(404);
  expect(s.purchase).not.toHaveBeenCalled();
  expect(s.fulfil).not.toHaveBeenCalled();
});
it("verifies the settled transaction with Qatom before fulfilling", async () => {
  const s = setup();
  expect((await s.handle(request())).status).toBe(200);
  expect(s.purchase).toHaveBeenCalledWith(transactionId, expect.any(String));
  expect(s.fulfil).toHaveBeenCalledWith(transactionId, transactionId, expect.objectContaining({ amount: "0.01" }), 1000);
});
it("rejects malformed and extra callback fields", async () => {
  const s = setup();
  expect((await s.handle(request(undefined, { request_id: transactionId, expires_at: "2099-01-01" }))).status).toBe(400);
  expect(s.purchase).not.toHaveBeenCalled();
});
it("fails closed during a payment verification outage", async () => {
  const s = setup();
  s.purchase.mockRejectedValue(new Error("unavailable"));
  expect((await s.handle(request())).status).toBe(503);
  expect(s.fulfil).not.toHaveBeenCalled();
});
