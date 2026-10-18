import { ALERT_PASS_DURATION_MS, ALERT_PASS_PRICE, type SettledPurchase } from "@/contracts/alert-passes";

export function alertPassWindow(requestedAt: string) {
  const start = Date.parse(requestedAt);
  if (!Number.isFinite(start)) throw new Error("Invalid alert pass request time");
  return { requestedAt: new Date(start).toISOString(), expiresAt: new Date(start + ALERT_PASS_DURATION_MS).toISOString() };
}
export function validAlertPurchase(
  purchase: SettledPurchase,
  expected: {
    transactionId: string;
    itemId: number;
    digitalQuantity: string;
    requestedAt: string;
    expiresAt: string;
    now: number;
  },
): boolean {
  const settledAt = Date.parse(purchase.settled_at);
  return (
    purchase.transaction_id === expected.transactionId &&
    purchase.catalog_item_id === expected.itemId &&
    purchase.amount === ALERT_PASS_PRICE &&
    purchase.dq === expected.digitalQuantity &&
    settledAt >= Date.parse(expected.requestedAt) &&
    settledAt <= expected.now &&
    settledAt < Date.parse(expected.expiresAt) &&
    expected.now < Date.parse(expected.expiresAt)
  );
}
export function passDeadline(expiresAt: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(expiresAt));
}
