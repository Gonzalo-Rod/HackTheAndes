# WhatsApp command guide

This guide describes the commands implemented in PeruRoad Climate. Send each
command as a separate WhatsApp message to the team's existing bot. Commands and
copyable examples stay in Spanish, as in the bot; explanations are in English.

Use the **latest code supplied by the bot**, replacing `<code>` below. Do not
send the angle brackets or the word `code`. Confirmation codes have eight
characters and expire with their proposal after 30 minutes. Type confirmations;
voice notes cannot authorize publication, subscriptions or weekly PDFs.

## Quick reference

| Command | What it does |
| --- | --- |
| `AYUDA` | Show the available features and commands. Aliases: `HELP`, `HOLA`, `INICIO`. |
| `ESTADO` | Nationwide summary of current SUTRAN alerts (the same live feed as the dashboard): counts, the five most severe, and the roads with most alerts. Alias: `STATUS`. |
| `ESTADO <road>` | Current SUTRAN alerts on one road, e.g. `ESTADO PE-22`, with a map link filtered to that road (or straight to the alert when there is only one). |
| `EXPOSICION` | Compare estimated climate exposure over the next 24 hours across every road with an estimate, most exposed first. Alias: `CLIMA`. |
| `EXPOSICION <road>` | Estimated exposure for one registered road, e.g. `EXPOSICION PE-32`; uncovered roads list the covered ones. |
| `EXPOSICION <place>` | Check estimated exposure near a recognized PE-22 place. `CLIMA <place>` also works. |
| `ESTADO PERU` / `EXPOSICION PERU` | Always the nationwide answer, even with a saved road. Aliases: `TODO`, `NACIONAL`. |
| `GUARDAR CARRETERA <road>` | Optional, typed only: save one road code so a bare `ESTADO`/`EXPOSICION` answers for it. Alias: `RECORDAR CARRETERA`. Needs Atomic Memory configured; see [saved road](saved-road-memory.md). |
| `MI CARRETERA` | Show the saved road. |
| `OLVIDAR CARRETERA` | Delete the saved road. Alias: `BORRAR CARRETERA`. |
| `REPORTE <description>` | Start a community report. Alias: `REPORTAR <description>`. |
| `CONFIRMAR <code>` | Publish the current report after reviewing its proposed location. The report remains unconfirmed by an authority. |
| `CANCELAR` | Discard a report draft, or the route being entered if route selection is active. Alias: `CANCEL`. This does not stop an active subscription. |
| `RUTA` | Choose or change the route using an existing valid pass, without another payment: the bot asks for the road code, then origin and destination. |
| `RUTA <road>` | Same, choosing the road at once, e.g. `RUTA PE-32`. Any road with a climate estimate is accepted; the bot lists them. |
| `RUTA ACTIVAR <code>` | Confirm the proposed route using your current pass; no new charge or expiry extension. |
| `RUTA CANCELAR` | Discard a route proposal, including its pending activation proposal; preserve the current active subscription. |
| `SUSCRIBIR 7 DIAS` | Purchase seven-day access. This does not activate alerts or select a route. |
| `SUSCRIBIR` | Same seven-day pass purchase flow. Alias: `AVISAME`. |
| `ACTIVAR <code>` | Accept the pass purchase terms and prepare Qatom checkout. Normal access starts only after verified payment. |
| `PAGAR` | Retrieve the saved checkout link or retry preparing it for the existing request. |
| `PAGO` | Show the locally verified payment/access status; a pending request can also return its checkout link. |
| `SEMANAL` | Request separate consent for the weekly environmental PDF. Requires a valid pass and a confirmed active route. |
| `SEMANAL ACTIVAR <code>` | Confirm the separate weekly-PDF consent. |
| `PDF` | Request the environmental report as a PDF attachment after weekly consent. |
| `SEMANAL BAJA` | Stop weekly PDFs while keeping short alerts active. |
| `BAJA` | Stop automatic alerts and weekly PDFs; cancel pending subscription/payment requests. Alias: `STOP`. |

`KM 100` is an **endpoint input during `RUTA`**, rather than a standalone query
or report location command. See the route flow below.

## Check conditions without subscribing

Send any of these messages independently:

```text
ESTADO
ESTADO PE-22
EXPOSICION
EXPOSICION PE-32
EXPOSICION Chosica
CLIMA La Oroya
```

`ESTADO` reads the same live national SUTRAN feed as the dashboard (with its
cache and bundled-snapshot fallback, labeled as saved data). A road code narrows
it to that road; zero padding is ignored (`PE-8B` = `PE-08B`). Free text after
`ESTADO` that is not a road code goes to the natural-language parser. It does not
list community reports or apply the subscribed route filter. `EXPOSICION` combines
forecast rainfall and mapped terrain susceptibility. Possible-huaico messages
are estimates, not confirmed events or validated occurrence probabilities.

A native **static WhatsApp location pin** checks exposure near that point when
no report or route draft is active. The pin is matched to PE-22 first and then
to the nearest other road with an estimate; a pin more than 500 m from all of
them is rejected with the list of covered roads. During a report or route
conversation, the pin completes that draft instead. Place names use the PE-22
catalog only; elsewhere, send a pin or the road code.

Natural-language questions are also supported when the interpretation service is
available. Explicit commands are the most predictable way to select a feature.

## Report an event and show it on the map

1. Describe what you are observing, where it is, and whether it is still active:

   ```text
   REPORTE Hay un derrumbe cerca del Puente Río Blanco. Sigue activo y bloquea un carril.
   ```

2. Answer any follow-up questions. If the bot cannot locate the event, share a
   static WhatsApp pin **at the event**, rather than your current location.
   A kilometer reference alone is not enough to locate a report in this flow.
3. Review the proposed pin and send the exact `CONFIRMAR <code>` from the latest
   bot reply. Changing details or the pin can generate a new code.
4. The bot acknowledges publication and supplies a map link. The community marker
   remains **NO CONFIRMADO**; publication is not official verification.

`CANCELAR` discards the unpublished draft. Starting a new `REPORTE` replaces the
previous draft. The flow does not publish an active incident when the description
says it has already ended, and it does not certify reopening or clearance.
Finish or cancel route selection before starting a report.

## Buy access, then choose a route

First send `SUSCRIBIR` (or `SUSCRIBIR 7 DIAS`), review the price and duration,
and type the exact `ACTIVAR <code>` supplied by the bot. Open the Qatom checkout
link and complete payment there. `PAGAR` retrieves the saved link; `PAGO` reports
the verified result. Receiving a link or sending `ACTIVAR` alone does not prove
that access is active. Purchasing access **does not start alerts**.

The pass costs **USD 0.50 once**, lasts **168 elapsed hours from the original
purchase request**, and has no automatic renewal. Paying later does not move the
expiry forward. `SUSCRIBIR UNA SEMANA` and `SUSCRIBIR POR UNA SEMANA` are accepted
aliases. If you already have a valid pass, `SUSCRIBIR` directs you to `RUTA`
without creating another purchase.

With a valid paid pass or configured free DEMO pass, choose your route:

Send these messages in order, waiting for the bot's question after each step:

```text
RUTA
PE-32
KM 100
KM 110
```

`RUTA PE-32` combines the first two messages. The road code chooses which road the
following steps refer to; `KM` without a road asks for it first. The first endpoint
is the origin; the second is the destination. At either step, you can instead share
a static location pin within 500 m of that road (a pin sent before the road code
selects the nearest registered road), or, on PE-22 only, a recognized place such as
`Chosica`. The road cannot change after the origin; send `RUTA PE-xx` to start over. Optional labels such as `ORIGEN: KM 100` and `DESTINO: KM 110` are
accepted. Decimal distances such as `KM 100.5` are accepted within map coverage.

Review the proposed range, then type its exact **`RUTA ACTIVAR <code>`**. This
starts route alerts using the existing pass. Changing origin/destination does
not create another checkout, charge again or extend the pass expiry.

`SUSCRIBIR Chosica–La Oroya` is no longer a combined purchase/route command; it
redirects you to the two separate steps above. Use `RUTA` for endpoint selection.
`PAGAR` and `PAGO` do not themselves charge a wallet. `BAJA` stops notifications
without removing paid time; it does not issue a refund. Send `RUTA` again to
resume notifications within the same valid pass.

The selected range follows the chosen road's captured axis; a phone has one active
route, so a new road replaces the previous one. Map kilometers are
approximate measured distances, not official road kilometer markers. The bot
does not track the phone continuously, calculate alternative roads or estimate
arrival times. Use `RUTA` again to propose a different stretch, review its range,
and confirm with `RUTA ACTIVAR <code>`. Replacing the subscription requires authorizing
weekly PDFs again.

### When alerts arrive

An eligible active subscription receives relevant new or changed information
inside its selected stretch: official SUTRAN updates, community reports clearly
labeled **SIN CONFIRMAR** (PE-22 only, where reports are accepted), and estimated
possible-huaico conditions. These source types remain distinct. Off PE-22, official
updates come from the live national feed and are checked by the five-minute recovery
job; the message header names the road (`PeruRoad · PE-32`).

There is no fixed 30-minute digest and no quiet-hours restriction. Unchanged
information is deduplicated. Reports can trigger delivery after publication;
official and climate updates depend on their source refreshes (currently every
10 minutes and hourly, respectively), with a five-minute recovery job. Delivery
also depends on provider availability and WhatsApp permissions; outside the
24-hour conversation window, an approved template is required.

Alerts end when the pass expires or you send `STOP` / `BAJA`.

## Receive the weekly PDF

With a valid pass and a confirmed active route **on PE-22** (the PDF's official-alert
counts come from the PE-22 archive; on other roads `SEMANAL` and `PDF` explain this
instead of sending false zeros):

1. Send `SEMANAL` and review its separate consent message.
2. Type the exact `SEMANAL ACTIVAR <code>` it supplies.
3. Send `PDF` to request an attachment immediately.

The automatic schedule is **Monday at 07:00, Peru time**. Outside the conversation
window, delivery requires an approved notice template; reply `PDF` to receive the
attachment when prompted. Unavailable delivery remains pending.

The report opens with indicator cards, a bar of kilometers per exposure level and a
rainfall chart along the route, followed by the reporting period, available
environmental records and a 10-km rainfall table. Missing data is explicit. A saved PDF does not
update itself. Requests are limited to three per 15 minutes.

`SEMANAL BAJA` stops only PDFs. `BAJA` / `STOP` stops PDFs and short alerts.

## Voice notes and demonstration commands

Voice notes can supply questions or report descriptions when transcription is
available. For example, say:

```text
Reporte de prueba. Hay un derrumbe cerca del Puente Río Blanco. Sigue activo.
```

The bot transcribes the audio and follows the same report flow. Confirm the pin
and type `CONFIRMAR <code>` afterward. Photos, videos and incoming document
attachments are not interpreted as reports. If audio fails, send text instead.

| Demonstration command | Meaning |
| --- | --- |
| `REPORTE PRUEBA <description>` | Create a clearly labeled demonstration report, excluded from impact counts. `REPORTE DE PRUEBA` and `REPORTAR PRUEBA` also work. |
| `RUTA PRUEBA` | Propose a demonstration route using an existing DEMO pass and the same endpoint steps. |
| `SUSCRIBIR PRUEBA` | Request a demonstration pass; choose the route separately afterward. |
| `SUSCRIBIR PAGO PRUEBA` | For a configured test phone only: deliberately request a **real USD 0.50 checkout**, labeled PRUEBA DE PAGO REAL. This is not the free DEMO flow. |

Only server-configured test phones can activate **free DEMO subscriptions**.
Typing `PRUEBA` from another phone does not bypass payment. Test activity does
not count as external-user traction. Do not invent road events for a normal report;
use the report's `PRUEBA` prefix for demonstrations.

## Which confirmation or cancellation do I need?

| Your goal | Send |
| --- | --- |
| Publish the report whose pin you reviewed | `CONFIRMAR <report code>` |
| Accept the pass purchase and prepare checkout | `ACTIVAR <purchase code>` |
| Start or change route alerts using the valid pass | `RUTA ACTIVAR <route code>` |
| Authorize weekly PDFs separately | `SEMANAL ACTIVAR <weekly code>` |
| Discard an unpublished report or the route currently being entered | `CANCELAR` |
| Discard a pending route proposal without stopping existing alerts | `RUTA CANCELAR` |
| Stop PDFs only | `SEMANAL BAJA` |
| Stop all automatic notifications | `BAJA` or `STOP` |

The four codes are independent. If a code expires or is rejected, restart that
specific flow and use its latest reply.

## Implementation and verification checkpoint

The separate purchase/route flow uses migration
`20261018090000_separate_alert_pass_and_route.sql` (applied). National routes use
`20261018100000_national_route_subscriptions.sql` (applied). National queries, road
selection and off-pilot alerts are covered by tests and a local run against live
data, not yet by a phone check.

As of October 18, 2026, participant checks have confirmed query replies, test
report publication/map markers, voice-note reports, route alerts and PDF attachment
delivery. Qatom checkout-link delivery is confirmed; **real payment settlement
and paid activation remain untested**, because the participant stopped before
purchase. Approved-template delivery outside the conversation window must be
verified separately. No trained forecast model or departure-planning command is
available in this flow.

For technical setup, see [Zavu integration](zavu-messaging.md),
[driver notifications](driver-notifications.md), [weekly PDFs](weekly-environmental-pdf.md)
and [Qatom passes](qatom-alert-passes.md).
