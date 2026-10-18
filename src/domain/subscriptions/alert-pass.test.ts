import { expect, it } from "vitest";
import { alertPassWindow, validAlertPurchase } from "./alert-pass";
import { settledPurchaseSchema } from "@/contracts/alert-passes";
const window = alertPassWindow("2026-10-18T04:30:00.000Z");
const purchase = settledPurchaseSchema.parse({
  transaction_id: "b2b0d2c6-1f4e-4a90-9a1e-2c9a4a7f0f11",
  catalog_item_id: 123,
  amount: "0.01",
  dq: "synthetic-usd-tdn",
  settled_at: "2026-10-18T04:31:00.000Z",
  dispatch_status: "pending",
});
const expected = {
  ...window,
  itemId: 123,
  digitalQuantity: purchase.dq,
  transactionId: purchase.transaction_id,
  now: Date.parse("2026-10-18T04:32:00Z"),
};
it("expires after 168 elapsed hours from the request, including across Lima midnight", () => {
  expect(window.expiresAt).toBe("2026-10-25T04:30:00.000Z");
  expect(validAlertPurchase(purchase, expected)).toBe(true);
  expect(validAlertPurchase(purchase, { ...expected, now: Date.parse(window.expiresAt) })).toBe(false);
});
it("does not extend a week from a late payment", () => {
  const late = { ...purchase, settled_at: "2026-10-24T04:30:00.000Z" };
  expect(validAlertPurchase(late, { ...expected, now: Date.parse("2026-10-24T04:31:00Z") })).toBe(true);
  expect(window.expiresAt).toBe("2026-10-25T04:30:00.000Z");
});
it("rejects the wrong item, currency, transaction, future settlement and settlement before consent", () => {
  expect(validAlertPurchase(purchase, { ...expected, itemId: 124 })).toBe(false);
  expect(validAlertPurchase(purchase, { ...expected, digitalQuantity: "other" })).toBe(false);
  expect(validAlertPurchase(purchase, { ...expected, transactionId: "other" })).toBe(false);
  expect(validAlertPurchase(purchase, { ...expected, now: Date.parse(window.requestedAt) })).toBe(false);
  expect(validAlertPurchase({ ...purchase, settled_at: "2026-10-18T04:29:00Z" }, expected)).toBe(false);
});
it("rejects the previous price and malformed settlement responses at the provider boundary", () => {
  expect(settledPurchaseSchema.safeParse({ ...purchase, amount: "0.001" }).success).toBe(false);
  expect(validAlertPurchase({ ...purchase, amount: "0.001" }, expected)).toBe(false);
  expect(settledPurchaseSchema.safeParse({ ...purchase, transaction_id: "fake" }).success).toBe(false);
});
