# Qatom weekly WhatsApp alert pass

Participant authorization, October 18, 2026: one payment of **0.001 USD-TDN
(USD 0.001)** for **168 elapsed hours from the original WhatsApp request**.
This supersedes the previous payment exclusion for this feature. There is no
recurring subscription, automatic renewal or scheduled charge to cancel at Qatom.
Qatom collects payment; PeruRoad grants and expires alert access.

## Driver flow

1. `SUSCRIBIR 7 DIAS` selects the available corridor. Existing `SUSCRIBIR` and
   named stretches also use the weekly price. `RUTA` retains endpoint selection.
2. Review the route, price, duration, uncertainty and cancellation terms. Type
   `ACTIVAR <code>` within 30 minutes. This creates an encrypted pending purchase
   request; it does not grant unpaid production access.
3. The backend calls OpenAI's Responses API with the Qatom MCP tool. The only
   exposed tool is `guest_checkout`; it receives the configured catalog item ID
   and an opaque request UUID. No phone number, route coordinates or raw driver
   message enters this payment request. The driver's own Qatom checkout page
   handles payment and credentials. The server never spends a seller/agent wallet.
4. Qatom calls `POST /api/qatom/alert-pass` after settlement. The backend checks its
   secret Authorization fulfilment header, validates `X-Qatom-Transaction-Id`, and
   fetches `/v4/catalog/purchases/{transaction_id}`. Only the expected item, exactly
   `0.001`, the configured USD-TDN digital quantity, and an in-window settled sale
   can activate the existing request. The original request pins recipient, route
   and expiry. A unique transaction ledger and serialized transactions prevent
   duplicate activation or transaction reuse across requests.
5. `PAGO` reports locally verified payment/access status. `PAGAR` returns the
   persisted checkout link or retries link creation after an outage. These commands
   do not charge the driver. Alerts begin only when the fulfilment transaction
   commits; a model's prose or a checkout-page redirect never grants access.
6. Access ends at request time + 168 hours, even if payment was later. Eligibility,
   delivery claim and destination lookup check expiry independently. The existing
   five-minute recovery job reconciles `opted_out_at`, queued alerts, encrypted
   contact delivery and separately authorized PDF delivery after expiry. `STOP` or
   `BAJA` cancels consent and pending payment activation immediately. A delayed
   callback cannot restore cancelled consent. Already accepted messages cannot
   be recalled. Cancellation does not issue a refund.

`PRUEBA` is free only when the sender is explicitly present in `TEST_PHONE_KEYS`
and requests a DEMO subscription. Typing PRUEBA alone cannot bypass payment.
DEMO grants also expire. Reporting, ESTADO and EXPOSICION remain free. Weekly PDFs
still require separate consent and are never automatically enrolled.

## Deployment and seller setup

Implementation is local until deployed. Apply the new migration together with
the new application version. **Existing subscriptions have no paid grant and
become ineligible under the new delivery checks**; they must request a new pass.
No existing subscriber is billed or enrolled automatically. Coordinate the rollout
before applying this to the shared database. Never modify an applied migration.

1. Use the existing PostgreSQL migration runner; dry-run first. Build the data
   package before the root application, as in the root README. The new migration
   is `20261018060000_qatom_alert_passes.sql`.
2. Publish the application to the intended host. The public free terms/coverage
   endpoint is `/api/subscriptions/plan`; `/llms.txt` is generated from
   `qatom/catalog.json`. Test that the paid fulfilment endpoint refuses a missing
   or wrong Authorization header. Do not publish an item pointing at an untested
   endpoint. An inactive draft should be created first for secret configuration.
3. In Qatom account `hack-base`, create a **new dedicated item** from
   `qatom/catalog.json`: POST to the deployed `/api/qatom/alert-pass`, price 0.001,
   public, featured, initially inactive. Include the host's absolute `/llms.txt`
   URL in its description and keep it under 1,024 characters. Set the receipt
   descriptor in a single subsequent item update. The existing item **215,
   `peruroad-test-pass`**, is a test-only receipt endpoint and grants no access;
   do not repurpose it or use it as `QATOM_CATALOG_ITEM_ID`.
4. The account owner creates/stores an independent fulfilment token in the hosting
   secret store as `QATOM_FULFILMENT_TOKEN` and in the item's sensitive header
   `Authorization: Bearer <token>`. The owner enters secrets, never the agent.
   Save the headers separately and reload to verify they are listed.
5. Configure a dedicated managed-agent client for the seller's own MCP server.
   Use its provided `agent_...` client ID, secret, resource and MCP URL. The
   documented managed-agent credential acts as the account on the payment API,
   and is accepted only by that MCP server. The runtime exchanges client
   credentials at `https://pay.m.todaq.net/v4/oidc/token`, with HTTP Basic,
   `grant_type=client_credentials` and `resource=<MCP origin>`. It caches tokens,
   coalesces concurrent exchanges, and obtains a fresh one before expiry. Codex's
   interactive OAuth login is separate and is not copied into the application.
   If the dashboard does not expose managed-agent setup, the account holder can
   use the documented `POST /v4/mcp/servers/hack-base-un45ktzl/agent` endpoint
   with their account authentication and channel `{"type":"whatsapp"}`. Its
   `client_secret` is returned only once and must go directly into the hosting
   secret store. `GET` on that endpoint shows existing connection metadata but
   never recovers a secret. Do not detach an existing agent to obtain a new secret
   without reviewing the service that uses it. Ordinary account credentials from
   Settings are not a substitute for this server-bound `agent_...` credential.
6. Set `QATOM_CATALOG_ITEM_ID`, `QATOM_USD_TDN_DQ` (the seller's USD-TDN digital
   quantity hash), `QATOM_MCP_URL`, `QATOM_CLIENT_ID`, `QATOM_CLIENT_SECRET`, and
   `QATOM_FULFILMENT_TOKEN` server-side. Use the existing `OPENAI_API_KEY`; the
   optional `OPENAI_QATOM_MODEL` defaults to the established GPT-4.1 mini snapshot.
   A partial/missing configuration fails closed with a WhatsApp retry message.
7. Read the item back, activate it only after endpoint/header configuration, then
   test a real paid purchase with the driver's explicit approval. Check the real
   ledger, expiry, WhatsApp delivery and STOP. Free coverage can be checked first.
   Record a launch report before claiming the service is live. Qatom account
   changes require the approval links returned by its MCP tools; never approve
   on the account holder's behalf.

The authenticated MCP was verified against the running server
`https://hack-base-un45ktzl.mcp.m.todaq.net`. No new item, credential, deployment,
shared migration or paid transaction is implied by this implementation document.

## Failure and verification boundaries

| Condition | Behavior |
| --- | --- |
| OpenAI, MCP or Qatom auth unavailable | No unpaid activation; PAGAR offers a retry. Billable Responses POSTs are not automatically retried. |
| Duplicate inbound message | Durable intake replay plus checkout lease; reuse the saved encrypted link. |
| Duplicate or concurrent fulfilment | Same settled sale acknowledged once; expiry unchanged. |
| Wrong item, amount, currency or transaction | No grant. |
| Cancelled/expired request paid late | No revival or extension. Fulfilment returns an explicit unavailable status; seller support/refund review is required. |
| Expiry during delivery | Destination lookup refuses access at the exact deadline without waiting for cleanup. |
| Existing unpaid subscription | Ineligible after rollout; no silent charge or migration to a paid plan. |
| Checkout link becomes stale or upstream times out ambiguously | The request still has a single grant. An unobserved upstream link may exist; do not pay multiple links. There is no automatic refund API in this feature. |

Run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build`. Run
`src/db/alert-passes.integration.ts` with the database Vitest config against a
migrated test database; it covers consent, encrypted link reuse, concurrent sale
callbacks, cross-request reuse, STOP, exact expiry, late/wrong purchases, DEMO
bypass and ledger permissions. Tests use synthetic identities and fake provider
responses and never charge a wallet. Local verification uses actual subscription,
PDF, route and payment migrations in isolated PostgreSQL with minimal spatial-table
stubs; it does not establish full PostGIS setup or a real paid launch.

Sources: [Qatom API](https://docs.qatom.ai/), its live
[OpenAPI contract](https://pay.m.todaq.net/v4/openapi.json), the authenticated Qatom
`guest_checkout` schema, and [OpenAI remote MCP documentation](https://developers.openai.com/api/docs/guides/tools-connectors-mcp).
