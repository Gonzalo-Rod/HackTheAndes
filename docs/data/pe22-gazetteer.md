# PE-22 gazetteer and kilometer evidence

The location module supplies sourced road landmarks for member B and shared
nearest-road lookup for report pins. It lives in `packages/road-data/`, separate
from the frontend and API application. It does not infer a precise location from
free-form text such as “past the bridge”; B must ask for a landmark or shared pin.

## Sources and verified capture

The public [MTC service hosted by IGN](https://www.idep.gob.pe/geoportal/rest/services/INSTITUCIONALES/MTC/MapServer)
exposes [tolls (5)](https://www.idep.gob.pe/geoportal/rest/services/INSTITUCIONALES/MTC/MapServer/5),
[SOS posts (6)](https://www.idep.gob.pe/geoportal/rest/services/INSTITUCIONALES/MTC/MapServer/6),
and [bridges (7)](https://www.idep.gob.pe/geoportal/rest/services/INSTITUCIONALES/MTC/MapServer/7).
The versioned snapshot at `data/pe22/gazetteer.json` contains normalized source
records, exact query URLs, the retrieval time, excluded IDs/reasons, and derived
locations. Source object IDs are namespaced by layer and are not surveyed marker IDs.

The capture at `2026-10-17T21:45:09.373Z` returned 116 records. The derived
gazetteer has **67 candidates: 52 bridges, 14 SOS posts, and the Corcona toll
station**. Generic/unnamed labels account for 32 exclusions; 17 other points are
more than 500 m from the captured road. Source names and coordinates remain
unchanged; separate snapped coordinates describe their nearest road position.

Toll and SOS requests filter exact route `PE-22`. The bridge layer has no route
field, so its query uses envelope `[-77.01,-12.06,-75.88,-11.49]` followed by the
same 500 m proximity filter. Nearby bridges may belong to another road, a
parallel alignment, or a crossing: their `reportedRoadCode` stays null and every
candidate remains `verified: false`. Dataset survey date, positional accuracy,
and reuse terms are unverified. Retain MTC/IGN attribution and review provider
terms before broader redistribution. Public access alone is not a license claim.

## Kilometer references remain unverified

`distanceFromOriginKm` is measured along our captured geometry; `reportedKm`
is copied from the source. `officialKm` remains null. Only the 15 toll/SOS
records explicitly labeled PE-22 enter `kilometerEvidence.anchors`, each with
its measured position and the difference from its reported kilometer.

Those offsets vary along the road. Bridge kilometer values also include zeros
and values that may refer to other routes. These observations do not justify a
constant offset or linear interpolation of official kilometers. This slice
preserves the evidence for calibration review and leaves segment calibration
unchanged. Independently checked markers are still needed before assigning
calibrated endpoint kilometers; see [the geometry notes](pe22-geometry.md).

## Reproduce and persist

```sh
npm --prefix packages/road-data ci

# Refresh the three public layers; no credentials required.
npm --prefix packages/road-data run pe22:gazetteer

# Rebuild from the embedded source and compare the complete artifact, offline.
npm --prefix packages/road-data run pe22:gazetteer -- --offline

# Operator: apply pending migrations using the existing local management config.
npm --prefix packages/road-data run db:migrate -- --dry-run
npm --prefix packages/road-data run db:migrate

# Import road geometry first, then the gazetteer using the scoped backend login.
npm --prefix packages/road-data run db:import-pe22
npm --prefix packages/road-data run db:import-gazetteer
```

Migration `20261017222000_gazetteer_provenance.sql` extends the existing
`gazetteer` table with provider identity, geometry revision, source-reported
kilometers, and projection provenance. `gazetteer_snapshots` stores the complete
validated source/derived artifact for freshness checks and reproducibility.
Both tables keep RLS and deny operational access to browser roles.

The import service rebuilds road geometry from the database's stored source,
then reproduces the supplied gazetteer before writing. A transaction locks the
parent geometry revision, skips identical or older snapshots, upserts by stable
provider/revision/source identity, and removes withdrawn candidates only for
that provider and revision. Legacy entries and historical revisions survive.
No segment geometry, elevation, or official kilometer value is modified.
Reproduction permits approximately 1 mm of numerical variation in derived
projections/distances across CPU and Node builds; source facts and identities
still match exactly. Accepted artifact values are preserved so repeat imports
remain idempotent across machines.

## Integration for B and D

Build the package before using its compiled exports:

```ts
import {
  createRoadLocator,
  resolvePlaceName,
} from "@peruroad/road-data/locations";
import { gazetteerSchema } from "@peruroad/road-data/locations/contracts";
import { importPe22Gazetteer } from "@peruroad/road-data/database";

const gazetteer = gazetteerSchema.parse(snapshot);
const match = resolvePlaceName(gazetteer, "Puente Río Blanco");
// matched, ambiguous, not_found, or unavailable; all require user confirmation.

const locator = createRoadLocator(baseSegments);
if (locator.ok) {
  const location = locator.value.locate([longitude, latitude]);
  // A typed failure rejects invalid coordinates or pins farther than 500 m away.
}
```

Names and aliases match exactly after case, accent, punctuation, and spacing
normalization. Duplicate names return all matching candidates; no fuzzy match
silently chooses a place. An unknown place requires a clarifying question or a
shared pin. The locator uses Turf's geodesic
[nearest point on a line](https://turfjs.org/docs/api/nearestPointOnLine), returns
the nearest display segment plus measured distance and offset, and assigns a
shared segment endpoint to the later segment. A successful projection does not
prove that a report concerns that road or establish its kilometer marker.

The shared contract entry point is browser-safe. The `/locations` entry point is
for server/operator code because it also exports preparation services; its pure
location functions use Turf without I/O. No public read route or WhatsApp
integration is added in this slice.

## Failure behavior and checks

| Provider or operation    | Failure                                                                 | Visible result                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MTC/IGN landmark refresh | Timeout, HTTP failure, malformed/empty layer, duplicate IDs, truncation | Keep a compatible verified cache, print its original retrieval time and age with `state: cached`, and exit 1; without a cache, print `state: unavailable`. |
| Offline verification     | Changed geometry or altered derived data                                | Reject the incompatible artifact and exit 1; never overwrite it.                                                                                           |
| Name lookup              | Unknown or ambiguous landmark                                           | Explicit `not_found` or `ambiguous`; require confirmation/shared pin.                                                                                      |
| Pin lookup               | Invalid coordinates or more than 500 m away                             | Typed `invalid_position` or `outside_corridor` failure.                                                                                                    |
| Database import          | Invalid snapshot or unavailable infrastructure                          | No intentional partial import; inspect state after an uncertain commit response before retrying.                                                           |

Requests use the shared timeout/retry/logging wrapper. Bounded layer queries
reject transfer-limit flags or 1,000 returned records rather than silently
accepting a possibly truncated dataset. All three layers must validate before
the snapshot is atomically replaced. A legitimately empty layer currently needs
operator review rather than automatically withdrawing all its candidates. A
source that leaves no usable candidates on the road is also rejected.

Offline tests cover name ambiguity, source validation, retry/timeout behavior,
geometry/revision failures, and the 500 m boundary. Database tests cover repeat
and concurrent imports, stale snapshots, withdrawals, preservation of legacy
entries, and rejection before partial writes. Test fixtures use isolated road
revisions and remove only their own records.
