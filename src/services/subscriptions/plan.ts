import catalog from "../../../qatom/catalog.json";
import { ALERT_PASS_DURATION_MS, ALERT_PASS_PRICE } from "@/contracts/alert-passes";
import { passPrice } from "@/domain/subscriptions/alert-pass";

export function alertPlan() {
  return Response.json(
    {
      item: catalog.items[0].key,
      price: ALERT_PASS_PRICE,
      currency: "USD-TDN",
      duration_hours: ALERT_PASS_DURATION_MS / 3_600_000,
      starts_at: "original_whatsapp_request",
      auto_renew: false,
      command: "SUSCRIBIR 7 DIAS",
      activation: "Typed ACTIVAR consent, followed by a verified settled Qatom payment",
      cancel_commands: ["STOP", "BAJA"],
      summary:
        `Pago único de ${passPrice()} por alertas hasta 7 días desde la solicitud, sin renovación automática. Reportar y consultar ESTADO o EXPOSICION sigue siendo gratuito.`,
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
export function alertReadme(request: Request) {
  const origin = new URL(request.url).origin;
  const item = catalog.items[0];
  const text = `# ${catalog.seller}

> WhatsApp environmental and road alerts for the selected PE-22 stretch. One payment of ${item.price} ${item.currency}; the pass expires 168 elapsed hours after the original WhatsApp request. No recurring billing. Reporting and on-demand status/exposure queries remain free.

Generated from qatom/catalog.json for this response. The catalog is the listing source of truth.

## How to call

The driver first sends SUSCRIBIR 7 DIAS (whole corridor) or RUTA (select endpoints), reviews the route and price, and types ACTIVAR <code>. The application issues an opaque request_id. Do not invent one, send a phone number, or reuse an expired/cancelled request.

From the Qatom master MCP (https://mcp.m.todaq.net), catalog_search for "${item.name}". Use guest_checkout with that item's returned catalog_item_id and arguments {"request_id":"<issued request UUID>"}. Give the checkout_url to the driver, who pays on Qatom. Do not spend an agent wallet or approve for the driver.

## Catalog

| Item | Price | Method | Required input |
| --- | --- | --- | --- |
| ${item.name} | ${item.price} ${item.currency} | ${item.method} | request_id |

The numeric catalog ID is assigned by Qatom at publication; discover it by exact name. The existing peruroad-test-pass item grants no access and must not be used for subscriptions.

Free coverage/terms: ${origin}/api/subscriptions/plan . Free reporting and ESTADO/EXPOSICION queries are available in WhatsApp. This purchase does not authorize weekly PDFs, calls or tracking.

## Input schema

\`\`\`json
${JSON.stringify(item.inputs, null, 2)}
\`\`\`

## Responses

The fulfilment response contains ok, status, summary, and expires_at when fulfilled. Dates are UTC; WhatsApp displays Peru time. active grants access only until expires_at. already_processed acknowledges the same transaction without extending access. request_not_found, request_unavailable, invalid_purchase and transaction_already_used do not activate access; return to WhatsApp and contact the seller if charged. Real HTTP errors: 400 invalid input/transaction, 404 missing or wrong fulfilment credential, 503 verification unavailable (retry delivery with the same transaction).

## Boundaries

SUTRAN conditions, unconfirmed community reports and estimated exposure remain distinct. Missing data never proves safety. The driver can send PAGO to check payment/access or STOP/BAJA to cancel. Cancellation stops delivery and pending activation; it does not issue a refund. Late payment cannot move the expiry. An accepted in-flight WhatsApp message cannot be recalled.

Site: ${origin}
Qatom documentation: https://docs.qatom.ai/
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
