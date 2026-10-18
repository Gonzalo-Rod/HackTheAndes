# Qatom weekly WhatsApp alert pass

Participant authorization, October 18, 2026, with the participant's price update:
one payment of **0.01 USD-TDN (USD 0.01)** for
**168 elapsed hours from the original WhatsApp request**.
This supersedes the previous payment exclusion for this feature. There is no
recurring subscription, automatic renewal or scheduled charge to cancel at Qatom.
Qatom collects payment; PeruRoad grants and expires alert access.

## Driver flow

1. `SUSCRIBIR` / `SUSCRIBIR 7 DIAS` purchases access independently of route
   selection. An existing valid pass directs the driver to RUTA without another purchase.
2. Review the pass price, duration and cancellation terms. Type
   `ACTIVAR <code>` within 30 minutes. This creates an encrypted pending purchase
   request; it does not grant unpaid production access.
3. The backend calls OpenAI's Responses API with the Qatom MCP tool. The only
   exposed tool is `guest_checkout`; it receives the configured catalog item ID
   and an opaque request UUID. No phone number, route coordinates or raw driver
   message enters this payment request. The driver's own Qatom checkout page
   handles payment and credentials. The server never spends a seller/agent wallet.
   The Responses MCP result can contain Qatom's three-line text receipt rather
   than JSON. The adapter accepts that exact receipt and validated JSON/MCP
   envelopes, checks the displayed 0.01 price and trusted HTTPS checkout domain,
   and ignores assistant prose. Parsing a link never activates a pass.
4. Qatom calls `POST /api/qatom/alert-pass` after settlement. The backend checks its
   secret Authorization fulfilment header, validates `X-Qatom-Transaction-Id`, and
   fetches `/v4/catalog/purchases/{transaction_id}`. Only the expected item, exactly
   `0.01`, the configured USD-TDN digital quantity, and an in-window settled sale
   can activate the existing request. The original request pins recipient and expiry. Settlement grants access with
   `route_active=false`; it never opts the driver into whole-corridor alerts. A unique transaction ledger and serialized transactions prevent
   duplicate activation or transaction reuse across requests.
5. `PAGO` reports locally verified payment/access status. `PAGAR` returns the
   persisted checkout link or retries link creation after an outage. These commands
   do not charge the driver. After fulfilment, the driver chooses origin/destination with `RUTA`, then
   types `RUTA ACTIVAR <code>`. This activates alerts without a second payment;
   changing routes preserves the payment ID and original expiry. A valid pass
   alone is insufficient for delivery; a model's prose or a checkout-page redirect never grants access.
6. Access ends at request time + 168 hours, even if payment was later. Eligibility,
   delivery claim and destination lookup check expiry independently. The existing
   five-minute recovery job reconciles `opted_out_at`, queued alerts, encrypted
   contact delivery and separately authorized PDF delivery after expiry. `STOP` or
   `BAJA` cancels notification consent and pending payment activation immediately,
   while preserving time remaining on an already granted pass. RUTA can resume
   alerts during that remaining time without another payment. A delayed
   callback cannot restore cancelled consent. Already accepted messages cannot
   be recalled. Cancellation does not issue a refund.

`PRUEBA` is free only when the sender is explicitly present in `TEST_PHONE_KEYS`
and requests a DEMO subscription. Typing PRUEBA alone cannot bypass payment.
A configured test sender can explicitly use **`SUSCRIBIR PAGO PRUEBA`** to test a
real USD 0.01 purchase. The proposal says **PRUEBA DE PAGO REAL**, requires typed
ACTIVAR consent and verified settlement, and keeps both the request and resulting
subscription test-marked for impact exclusion. A valid existing pass is reused;
wait for expiry before starting another purchase, including a payment test. `SUSCRIBIR PRUEBA` remains free for configured
test senders; unconfigured senders cannot use the payment-test command.

DEMO grants also expire. Reporting, ESTADO and EXPOSICION remain free. Weekly PDFs
still require separate consent and are never automatically enrolled.

## Deployment and seller setup

Apply `20261018060000_qatom_alert_passes.sql` and the additive
`20261018090000_separate_alert_pass_and_route.sql` with the matching application
version. The latter preserves existing active route consent and removes old
unconfirmed proposals that bundled route selection and purchase; drivers must
request fresh codes. It does not cancel settled sales or pending checkout requests. **Existing subscriptions have no paid grant and
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
3. In Qatom account `hack-base`, use the dedicated weekly item **216** and update
   it from `qatom/catalog.json`: POST to the deployed `/api/qatom/alert-pass`,
   price 0.01, public, featured. Keep it inactive during a price/deployment change
   using the procedure below. Include the host's absolute `/llms.txt` URL in its
   description and keep it under 1,024 characters. Set the receipt descriptor in
   the same item update when needed. The existing item **215,
   `peruroad-test-pass`**, is a test-only receipt endpoint and grants no access;
   do not repurpose it or use it as `QATOM_CATALOG_ITEM_ID`.
4. The account owner creates/stores an independent fulfilment token in the hosting
   secret store as `QATOM_FULFILMENT_TOKEN` and in the item's sensitive header
   `Authorization: Bearer <token>`. The owner enters secrets, never the agent.
   Save the headers separately and reload to verify they are listed.
5. Configure a dedicated managed-agent client for the seller's own MCP server.
   Use its provided `agent_...` client ID, secret, resource and MCP URL. The
   managed-agent credential is accepted by that MCP server. Its token is rejected
   by the REST payment API with `token_exchange_required`; never use it for sale
   verification. The runtime exchanges client
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
6. For settled-sale verification, add the seller account API credentials as
   `QATOM_API_CLIENT_ID` and `QATOM_API_CLIENT_SECRET`. The verifier exchanges
   these at `POST /v4/account/oauth/token`, with HTTP Basic, and caches the
   account token until one minute before its absolute `expires_at` timestamp. The
   live provider returns Unix seconds as a numeric string; the verifier accepts
   that representation and the integer declared in its OpenAPI contract.
   Do not put `agent_...` credentials in these variables, copy interactive Codex
   tokens, or weaken the settled-sale check to bypass an authentication failure.
   Set `QATOM_CATALOG_ITEM_ID`, `QATOM_USD_TDN_DQ` (the seller's USD-TDN digital
   quantity hash), `QATOM_MCP_URL`, `QATOM_CLIENT_ID`, `QATOM_CLIENT_SECRET`, and
   `QATOM_FULFILMENT_TOKEN` server-side. Use the existing `OPENAI_API_KEY`; the
   optional `OPENAI_QATOM_MODEL` defaults to the established GPT-4.1 mini snapshot.
   Retain both credential pairs: adding seller API credentials does not replace
   the MCP agent credentials. A partial/missing configuration fails closed with
   a WhatsApp retry message.
7. Read the item back, activate it only after endpoint/header configuration, then
   test a real paid purchase with the driver's explicit approval. Check the real
   ledger, expiry, WhatsApp delivery and STOP. Free coverage can be checked first.
   A configured test sender can exercise real checkout with SUSCRIBIR PAGO PRUEBA;
   ordinary DEMO requests remain free. Payment tests retain their test flags and
   never count as external-user traction. A consenting non-test sender can use
   the standard SUSCRIBIR 7 DIAS flow. Record a launch report before claiming the service is
   live. Qatom account
   changes require the approval links returned by its MCP tools; never approve
   on the account holder's behalf.

The authenticated MCP was verified against the running server
`https://hack-base-un45ktzl.mcp.m.todaq.net`. Deployment and migration evidence is
recorded in the local progress log; neither
this document nor a successful build establishes a real paid purchase.

## Changing the weekly price to USD 0.01

`qatom/catalog.json` is the application price source. Checkout validation, settled
sale validation, WhatsApp proposals/help/payment messages, the free plan and
generated `llms.txt` all read that price. Saving this file does not change Qatom
or a deployed build. The MCP catalog read on October 18 showed item **216 active
at USD 0.001**; the local change does not itself update that listing.

1. Arrange a checkout maintenance window: pause new purchase requests and
   deactivate item **216** in the Qatom dashboard for account `hack-base`.
   Keep existing payment callbacks available while resolving older purchases.
2. Resolve outstanding offers and checkout links at USD 0.001 before switching
   builds. Pending requests do not store a price version, and `PAGAR` can reuse
   a persisted link; changing the catalog does not rewrite an existing link.
   The new build intentionally rejects the old price. If old offers or links
   remain usable, defer the switch until they have settled, expired or been
   reconciled with the seller. Do not delete payment records or mark an unpaid
   request as paid. Already granted passes retain their original expiry.
3. Deploy this application version. Check `/api/subscriptions/plan` returns
   `"price":"0.01"` and its summary says `USD 0,01`; `/llms.txt` must also show
   `0.01 USD-TDN`. No additional database migration is needed for this price-only
   change; the feature's existing migrations are still required.
4. Edit item **216** in Qatom: set its price to **0.01 USD-TDN**, update any old
   price text in the description (the local description omits a duplicated
   price), and retain the correct absolute `/llms.txt` link. Remove the obsolete
   draft/inactive claim if launching. Save the item and read it back while it is
   still inactive. Retain its endpoint, input schema and saved fulfilment header.
   MCP updates require the account owner's approval at the tool-provided link.
5. Reactivate item **216** and resume purchase requests once both sides agree.
   Request a fresh `SUSCRIBIR 7 DIAS` proposal (or `SUSCRIBIR PAGO PRUEBA` for a
   configured test sender), confirm the displayed USD 0.01 price, and use a new
   checkout link. A real test payment requires the driver's approval; checkout
   creation alone does not verify settlement or grant access.

The credentials and currency identifier do not change with the price.
`QATOM_CATALOG_ITEM_ID` continues to identify item **216**; `QATOM_USD_TDN_DQ`
identifies USD-TDN, not the amount. Future price changes use the same procedure,
with the catalog price, relevant test fixtures and current documentation updated
together.

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
