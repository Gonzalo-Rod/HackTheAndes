import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { alertPassInputSchema, type SettledPurchase } from "@/contracts/alert-passes";
import { loadPlatformConfiguration, loadQatomConfiguration, loadQatomApiConfiguration } from "@/config/env";
import { createAlertPassFulfilment } from "@/db/alert-pass-fulfilment";
import { database } from "@/db/pool";
import { createQatomPurchaseVerifier } from "@/integrations/qatom/purchase-verifier";
import { failure, platformRoute, readJson } from "@/services/platform/http";

export function createAlertPassHandler(deps: {
  token: string;
  purchase: (id: string, traceId: string) => Promise<SettledPurchase>;
  fulfil: (requestId: string, transactionId: string, purchase: SettledPurchase, now: number) => Promise<unknown>;
  now: () => number;
}) {
  return platformRoute("qatom.fulfil_alert_pass", async (request) => {
    // Qatom documents a seller-configured secret header, not an HMAC signing format.
    const hash = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(hash(request.headers.get("authorization") ?? ""), hash(`Bearer ${deps.token}`)))
      failure(404, "not_found", "No encontrado.");
    const transaction = z.uuid().safeParse(request.headers.get("x-qatom-transaction-id"));
    if (!transaction.success) failure(400, "invalid_transaction", "Falta una transacción válida de Qatom.");
    const input = await readJson(request, alertPassInputSchema);
    const purchase = await deps.purchase(transaction.data, randomUUID());
    return Response.json(await deps.fulfil(input.request_id, transaction.data, purchase, deps.now()));
  });
}
let handler: ReturnType<typeof createAlertPassHandler> | undefined;
export const fulfilAlertPass = platformRoute("qatom.configure_fulfilment", async (request) => {
  if (!handler) {
    const qatom = loadQatomConfiguration(),
      platform = loadPlatformConfiguration();
    const client = createQatomPurchaseVerifier(loadQatomApiConfiguration());
    handler = createAlertPassHandler({
      token: qatom.QATOM_FULFILMENT_TOKEN,
      purchase: (id, traceId) => client.purchase(id, traceId),
      fulfil: createAlertPassFulfilment(
        database(),
        { key: platform.CONTACT_ENCRYPTION_KEY, version: platform.CONTACT_KEY_VERSION },
        {
          itemId: qatom.QATOM_CATALOG_ITEM_ID,
          digitalQuantity: qatom.QATOM_USD_TDN_DQ,
        },
      ),
      now: Date.now,
    });
  }
  return handler(request);
});
