# Route watch and monitor calls (F4)

A company's transport monitor (for example at a mining operation) chooses a PE-22 stretch and the
phone to call on the company page (`/empresa`). Two modes exist:

- **Continuous route watch** (`mode: "route"`): the whole stretch, plus 5 km beyond either end, is
  watched for 1 hour to 7 days (the form offers 12 h, 24 h, 3 days and 7 days). There is no truck
  position, so incidents anywhere on the stretch count. This fits a fleet operating on the route.
- **Truck trip** (`mode: "trip"`, the original behavior): the truck position is estimated from
  departure time and average speed, incidents already passed are dropped, and watching ends two
  hours after the estimated arrival.

The monitor sees active watches with their call counts and can stop one. Continuous watches need
migration `20261018080000_route_watch_window.sql` (adds `trips.watch_until`); apply it before
deploying this code, because listing and evaluating watches read that column.

## Endpoints

- `POST /api/company/trips` (company session with any active company plan): a trip
  `{ phone, originKm, destinationKm, mode?: "trip", departAt?, avgSpeedKmh?, callConsent: true }`
  or a continuous watch `{ phone, originKm, destinationKm, mode: "route", watchHours, callConsent: true }`.
  Distances follow the captured map axis (`geometry_distance`), not official kilometer posts. Trip
  speed defaults to 35 km/h. Returns `201` with the ID, `mode`, and `estimatedArrival` or `watchUntil`.
- `GET /api/company/trips`: the organization's planned and active watches with call counts; phones
  are never returned.
- `DELETE /api/company/trips/:id`: stops one of the organization's watches; unknown, finished and
  other organizations' watches all return `404`.
- `POST /api/jobs/route-watch` (`Authorization: Bearer $ROAD_DATA_JOB_SECRET`): evaluates every
  consenting watch on demand.

## Triggers

Route watch runs wherever driver alerts already run, so no extra n8n workflow is needed:

- `POST /api/jobs/alerts`, which the n8n driver-alerts workflow calls after each complete SUTRAN
  ingestion (source change) and every 5 minutes (recovery). Its response now includes `routeWatch`.
- After an accepted community WhatsApp report (`evaluateAlertsAfterChange`).

A route-watch failure (for example the migration not applied, or a Zavu outage) is logged as
`route_watch.source_change` and never blocks WhatsApp alert delivery; the next run retries.

## Ranking and call rules

`src/domain/route-watch/prioritize.ts` is pure and unit tested. For a trip the truck position is
estimated from departure time and average speed (no GPS) and incidents already passed are dropped;
a continuous watch places incidents on the stretch or within 5 km of either end. Incidents are
scored by type (huaico above derrumbe, inundación, bloqueo, accidente, obra), road status,
placement (ahead, or within 5 km past the destination), time to reach them, report recency and
official source. A call requires an incident that is official or has community confidence of at
least 0.7 (WhatsApp alerts relay unconfirmed reports, but a call does not), was reported within 12 hours, is not reported as normal traffic, and is a
huaico, derrumbe or inundación, or a closure. Estimated climate exposure never triggers a call.

Each run places at most one call per trip, for the highest-ranked eligible incident not yet called
about. The incident key is stored in `calls.outcome.incidentKey`, and the Zavu idempotency key
`route-watch:<trip>:<incident>` prevents a concurrent run from dialing twice. Calls are one-way
Spanish text-to-speech through Zavu, followed by a best-effort WhatsApp message (rejected outside
the 24-hour window; the call itself already delivered the alert). A stale or unavailable SUTRAN
poll contributes no official incidents and is reported as `officialState`; it is never read as a
clear road. Trips complete automatically two hours after their estimated arrival; continuous
watches complete at `watch_until`.

Demonstration incidents (`is_test`) only reach demonstration trips: trips of a test organization
or of a phone in `TEST_PHONE_KEYS`. No schema change was needed; the existing `trips` and `calls`
tables are used.

## Simulation

`npm run route-watch:simulate -- <E.164 phone> [--keep]` registers a demo trip (Huachipa to La
Oroya, departed an hour ago) under the test organization, ranks current incidents without
calling, publishes a simulated DEMO huaico near the Matucana bridge about 30 km ahead, evaluates
again (which calls the phone), then clears the huaico and completes the trip. Only use a
consenting phone; unverified Zavu accounts allow 5 voice sends a day.

On October 17, 2026 at 23:39 (Lima), the simulation ranked the simulated huaico first (score 15,
29.5 km ahead) and Zavu accepted the call to the participant's phone (`sent`). That first run
also called about an existing DEMO derrumbe before the simulated event, because the before step
still placed calls; it now ranks only. Whether the calls were heard is pending the participant's
confirmation.
