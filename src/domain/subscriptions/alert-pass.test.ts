import { expect, it } from "vitest";
import { alertPassWindow, validAlertPurchase } from "./alert-pass";
import { settledPurchaseSchema } from "@/contracts/alert-passes";
const window = alertPassWindow("2026-10-18T04:30:00.000Z");
const purchase = settledPurchaseSchema.parse({
  transaction_id: "b2b0d2c6-1f4e-4a90-9a1e-2c9a4a7f0f11",
  catalog_item_id: 123,
  amount: "0.50",
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
it.each(["0.5", "0.50", "0.500"])("accepts equivalent settled amounts %s without changing access or expiry", (amount) => {
  const parsed = settledPurchaseSchema.parse({ ...purchase, amount });
  expect(parsed.amount).toBe("0.50");
  expect(validAlertPurchase(parsed, expected)).toBe(true);
  expect(validAlertPurchase(parsed, { ...expected, now: Date.parse(window.expiresAt) })).toBe(false);
});
it.each(["0.001", "0.01", "0.499", "0.501", "1.000", "5e-1", "0.5001"])("rejects previous, incorrect or malformed amounts %s", (amount) => {
  expect(settledPurchaseSchema.safeParse({ ...purchase, amount }).success).toBe(false);
  expect(validAlertPurchase({ ...purchase, amount }, expected)).toBe(false);
});
it("rejects a malformed transaction at the provider boundary", () => {
  expect(settledPurchaseSchema.safeParse({ ...purchase, transaction_id: "fake" }).success).toBe(false);
});
