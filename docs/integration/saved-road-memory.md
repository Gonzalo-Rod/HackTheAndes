# Saved road (Atomic Memory)

An optional WhatsApp convenience: a driver types `GUARDAR CARRETERA PE-32` once, and later a bare
`ESTADO` or `EXPOSICION` answers for PE-32 with a footer naming the saved road. `ESTADO PE-22`
and `ESTADO PERU` keep their explicit meaning. `MI CARRETERA` shows it and `OLVIDAR CARRETERA`
deletes it. The saved road never activates alerts, selects a `RUTA`, or touches passes, and the
data it reads is the same SUTRAN and exposure data as an explicit road query.

It runs inside the existing Zavu webhook (`src/services/inbound/`); there is no new deployment,
database table or browser surface.

## Data and identity

- Stored: only the road code, as a verbatim memory (`skip_extraction`, `content_class: summary`)
  with `source_site: peruroad-whatsapp` and `metadata.externalId` so a re-save updates in place.
- Subject: `user_id` is an HMAC of the server `phone_key` under a separate purpose
  (`atomic-memory-subject-v1`), so it is not the phone number and cannot be joined to our
  database's `phone_key`. Nothing from the message chooses the subject.
- Listed records are re-checked for subject, `source_site` and a valid road code before use.
- Voice transcripts can query and delete but cannot consent to saving.

## Reliability

| Step | Budget | Behavior on failure |
| --- | --- | --- |
| Recall on bare `ESTADO`/`EXPOSICION` | 2 s, one attempt | National answer, prefixed with a note that the saved road could not be read. |
| Save (ingest POST) | 4 s, never retried | Any 2xx (200 or 201) is accepted, but the save counts only with stored/updated IDs or a matching readback; otherwise "not saved". Old records are deleted only after the new value is confirmed. |
| Forget / cleanup (DELETE) | 4 s, one retry; 404 counts as already deleted | A 2xx must carry `{ "success": true }`, and a list readback must show the IDs gone. Otherwise the reply says the road may still be saved (or that the previous road was kept); erasure is never claimed. |
| Malformed list response | — | Treated as unavailable, never as "no saved road". |

Every request uses `redirect: "error"`, so the bearer key never follows a redirect. Worst case for a save is about 22 s, inside the 60 s route duration and 90 s webhook lease.

## Configuration

Set `ATOMICMEMORY_API_URL` (HTTPS, or `http://127.0.0.1`/`localhost` for a local Core) and
`ATOMICMEMORY_API_KEY` server-side. The URL must not contain credentials, a query or a fragment. Both empty disables the feature, and the commands reply that
nothing was saved. A half or invalid pair also disables only this feature, with a structured
startup warning naming the variable; WhatsApp replies keep working.

## Local demo

`npm run saved-road:demo` runs `scripts/saved-road-demo.ts`: the real inbound routing, saved-road
flow and HTTP adapter, with the Atomic Memory fixture below and SUTRAN disabled, so ESTADO is
served from the bundled SUTRAN snapshot. It sends no WhatsApp message and calls no external
service. A recording and transcript are in [`docs/pr-demos/saved-road/`](../pr-demos/saved-road/).
The feature is bot-only, so there is no dashboard screenshot.

## Tests

`src/services/saved-roads/saved-road-flow.test.ts` drives the real command routing, flow and
HTTP adapter against `src/test-fixtures/atomic-memory.ts`, an in-process stand-in for the three
documented routes, not Atomic Memory itself. No credentials or network are needed. A live check
against Atomic Memory Cloud has not been run.
