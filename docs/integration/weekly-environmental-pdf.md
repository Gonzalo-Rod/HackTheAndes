# Weekly environmental PDFs for drivers

The participant requested PDF attachments instead of report links, delivered to
drivers who explicitly opt in. This replaces the earlier organization-only F6
delivery proposal. Existing company-report access remains unchanged; this feature
does not require payments, a company account or departure planning.

## Driver commands and consent

1. Choose and authorize a stretch through the existing `SUSCRIBIR` / `ACTIVAR`
   flow. This alone does **not** enable weekly PDFs.
2. Send `SEMANAL`. Review the stretch, Monday 07:00 Peru schedule and delivery
   explanation. Send the exact `SEMANAL ACTIVAR <code>` within 30 minutes.
3. Send `PDF` to request an attachment now, or to retrieve a pending weekly PDF.
   Requests are limited to three per 15 minutes per HMAC sender key.
4. `SEMANAL BAJA` disables only weekly PDFs. `BAJA` / `STOP` disables both short
   alerts and PDFs. Replacing the subscribed stretch requires new weekly consent.

Commands are routed before report extraction. The existing signed webhook and
encrypted replay cache make consent commands idempotent. Delivery addresses stay
encrypted in the existing contact table; no phone number or report text enters
the report, the summary provider or n8n execution data.

## Report content and interpretation

The compiled `@peruroad/road-data/reports` contract and pure aggregation module
define the PDF data. Reports contain a selected stretch, reporting period,
generation time, environmental SUTRAN alerts first observed in our archive and
unconfirmed community incident counts. These sources are not summed as unique
events, because cross-source coalescing remains unfinished. Production reports
exclude test/team community evidence; DEMO subscribers receive explicitly labeled
demonstrations. Accidents and construction do not enter environmental counts.

Rainfall is aggregated over the exact historical reporting hours using the latest
stored operational weather capture. Missing hours yield unavailable rainfall,
without redistributing weights. The future outlook is the current captured
72-hour **estimated exposure**, not a claim about events during the reporting week.
It retains weather time, rule version, assessment ID, geometry revision, sources
and unknown kilometers. Stale/unusable assessments have no actionable categories
or fresh forecast totals. A stored PDF never silently refreshes.

The driver-facing rainfall table uses approximate road-kilometer ranges instead
of HydroBASINS identifiers, with separate **report-period** and **following-three-day**
columns in millimeters. It uses the maximum across all linked drainage areas for
each period, matching the exposure policy; missing values in any required area
remain unavailable. Only contiguous stretches with equal displayed rainfall are
combined, preserving gaps and the selected stretch boundaries. These rainfall
figures are not water depth on the road or confirmed huaico predictions.

The optional `outlook.rainfallStretches` field extends the existing v1 JSON
contract without invalidating stored reports. New PDFs show plain Spanish,
explicit missing data, named sources and approximate kilometers; detailed source
URLs, assessment ID, rule version and geometry revision remain in the stored JSON
and PDF metadata. Existing stored PDF bytes are immutable; send `PDF` after the
new deployment to request the revised format. A legacy JSON report without road
rainfall detail renders a clear unavailable message instead of internal codes.

Archive start and incomplete monitoring are explicit. Zero records do not prove
zero events; neither a full week of monitoring nor closure duration is inferred
from source validity dates. Closure hours stay unavailable until an independently
reviewed duration calculation exists. Rainfall is modeled, catchments are coarse,
and geometry kilometers are not official road chainage.

The optional OpenAI step selects/orders IDs from five computed sentences. It
cannot write new prose or invent numbers; invalid IDs, timeout or provider errors
use the deterministic sentences with a visible fallback notice. No additional
LLM credentials are required. PDF generation uses `pdf-lib` inside Node, without
a deployment dependency on Python or a headless browser.

## Scheduling and delivery

[The n8n workflow](https://gozlie.app.n8n.cloud/workflow/qejq5LdvVA6QwpFn)
uses `workflows/n8n/weekly-environmental-pdf.sdk.js`, the existing Header Auth job
credential and the workflow timezone `America/Lima`:

- Monday 07:00: generate the previous seven days ending at that boundary.
- Every six hours at minute 10: retry pending work and catch up eligible weekly
  recipients, without enrolling drivers who consented after the weekly boundary.
- Manual trigger: current rolling-seven-day DEMO reports for opted-in test
  subscriptions only. It never targets production subscribers.

The authenticated `POST /api/jobs/weekly-reports` accepts only JSON
`{ "mode": "weekly" | "retry" | "demo" }`. Requests without the existing
`ROAD_DATA_JOB_SECRET` are rejected before generation or delivery. Batches are
bounded; recipients without a previous delivery sort first for catch-up runs.

Within WhatsApp's conversation window, the driver receives a `document` message
with a descriptive `.pdf` filename and a short caption. Outside it, the approved
`peruroad_weekly_pdf_v1` utility notice asks the driver to reply `PDF`; their reply
opens the window and the attachment is sent. The notice contains no report link.
This follows [Zavu's document-message requirements](https://docs.zavu.dev/guides/whatsapp/messages/document)
and [conversation-window/template rules](https://docs.zavu.dev/api-reference/send-a-message).
Dynamic document-header substitution is not assumed from undocumented behavior.

`ZAVU_WEEKLY_REPORT_TEMPLATE_ID` is optional server configuration, listed empty in
`.env.example`. Missing/unapproved templates keep the PDF pending; there is no SMS
fallback. A notification accepted by Zavu is not recorded as PDF delivery.

## Persistence and protection

Apply the additive `20261018035000_weekly_environmental_pdfs.sql` migration using
the existing database operator. New preference/outbox tables live in `private`,
have RLS and no browser-role privileges. Files are capped at 1 MiB and stored
atomically with validated report JSON before sending; short worker leases and
natural period/consent keys protect concurrent jobs. Retried sends retain the
same PDF bytes and provider idempotency key.

Zavu fetches the attachment through an HTTPS capability URL; the driver sees an
attachment rather than a link. HMAC signatures are purpose-bound, expire within
72 hours and contain no contact identifier. `GET /api/reports/pdf/:id` rechecks
active weekly consent and rejects missing/modified/expired signatures. Responses
are private/no-store, non-indexable and have PDF/nosniff headers. Do not paste
capability URLs into documentation or logs. New sends require at least 24 hours
of remaining file availability. Previously downloaded files cannot be revoked.

## Verification

Offline tests cover Lima week boundaries, fractional-distance clipping, unknown
coverage, missing rainfall, clipped kilometer ranges, maximum-across-area rainfall,
legacy report compatibility, source mismatch, summary grounding, PDF output,
signature tampering/expiry, window handling and provider failures/retries. Opt-in
database tests cover independent typed consent, encrypted destinations, concurrent
leases, replay/retry identity, RLS, weekly-only opt-out and global cancellation.

Local visual QA includes an explicitly synthetic layout sample and a DEMO PDF
generated from the persisted assessment. These are not phone-delivery evidence.
Hosted attachment receipt, automatic scheduled execution and out-of-window notice
delivery must each be recorded separately; template submission is not approval.

### Recorded participant verification (October 17, 2026)

Implementation `01a7011` passed all nine CI/deployment checks and is READY on the
shared Preview. The participant completed separate weekly consent, requested
`PDF`, and confirmed that the attachment arrived and opened; Zavu independently
reported `delivered` with message type `document`. This is a consenting participant
DEMO check, not external-user traction. The new notice template was rechecked as
`pending`, so out-of-window delivery is still unverified.

The n8n workflow is published and read back active in `America/Lima`. Manual DEMO
execution `57` reached the authenticated endpoint with zero weekly recipients;
after opt-in, execution `58` sent one PDF through the automation path. Manual
execution is not evidence that a Monday schedule has already fired. Offline
validation passed 365 application tests and 255 package tests; the database suite
passed 22 checks, including a regression for selecting only files belonging to
current weekly consent. Both unsigned hosted job and PDF requests returned 401.
