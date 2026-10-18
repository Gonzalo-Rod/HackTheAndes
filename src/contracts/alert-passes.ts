import { z } from "zod";
import catalog from "../../qatom/catalog.json";

const usdTdnAmountSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/);
// Qatom supports positive USD-TDN prices with at most three decimal places.
export const ALERT_PASS_PRICE = usdTdnAmountSchema
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0)
  .parse(catalog.items[0].price);

function canonicalAmount(value: string) {
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}
export const ALERT_PASS_DURATION_MS = 7 * 24 * 60 * 60_000;
export const alertPassInputSchema = z.object({ request_id: z.uuid() }).strict();
export const settledPurchaseSchema = z.object({
  transaction_id: z.uuid(),
  catalog_item_id: z.number().int().positive(),
  // REST may return 0.500 for a catalog price of 0.50; compare decimal strings exactly.
  amount: usdTdnAmountSchema
    .refine((value) => canonicalAmount(value) === canonicalAmount(ALERT_PASS_PRICE))
    .transform(() => ALERT_PASS_PRICE),
  dq: z.string().min(1),
  settled_at: z.iso.datetime({ offset: true }),
  dispatch_status: z.enum(["pending", "skipped", "delivered", "failed"]),
});
export type SettledPurchase = z.infer<typeof settledPurchaseSchema>;
export interface AlertPassCheckout {
  create(requestId: string, traceId: string): Promise<string>;
}
export interface AlertPassPayments {
  checkout(phoneKey: string, traceId: string, eventKey?: string): Promise<string | null>;
}

export const checkoutUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    ["checkout.m.todaq.net", "pay.m.todaq.net"].includes(url.hostname)
  );
}, "Untrusted Qatom checkout URL");
