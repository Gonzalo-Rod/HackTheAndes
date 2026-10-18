# Route watch and monitor calls (F4, backend only)

A company's transport monitor (for example at a mining operation) registers the PE-22 stretch a
truck will drive and the phone to call. While the trip is active, a scheduled job ranks every
incident on the remaining route and just past its destination, and calls the monitor about the
most relevant urgent one, such as a recent huaico ahead of the truck. The dashboard form is not
built yet.

## Endpoints

- `POST /api/company/trips` (company session with any active company plan):
  `{ phone, originKm, destinationKm, departAt?, avgSpeedKmh?, callConsent: true }`. Distances
  follow the captured map axis (`geometry_distance`), not official kilometer posts. Speed defaults
  to 35 km/h. Returns `201` with the trip ID and estimated arrival.
- `POST /api/jobs/route-watch` (`Authorization: Bearer $ROAD_DATA_JOB_SECRET`): evaluates every
  consenting trip. Schedule it every 5 minutes, like `/api/jobs/alerts`; it is not scheduled yet.

## Ranking and call rules

`src/domain/route-watch/prioritize.ts` is pure and unit tested. The truck position is estimated
from departure time and average speed (no GPS). Incidents already passed are dropped. Others are
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
clear road. Trips complete automatically two hours after their estimated arrival.

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
