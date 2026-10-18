# Member B: connect to the data service

Use `feat/data-model` and [PR #10](https://github.com/Gonzalo-Rod/HackTheAndes/pull/10),
which preserve every previous Role C commit and its required API/database work.
PRs #1–9 are superseded. Continue C's work on this branch; keep B's bot and D's
visualization on their own team branches until integration through review.

## Connection and credentials

API origin: `https://peruroad-api-git-feat-data-model-gozlie.vercel.app`.
Endpoint: `POST /api/internal/road-context`.

B needs two server variables: `ROAD_DATA_API_URL` (the origin above) and
`ROAD_DATA_API_SECRET`, obtained through the team's secure credential-sharing
mechanism. The participant's ignored `packages/road-data/.env.local` has the
configured values. B needs no Supabase connection, management token, or n8n
credential. The read credential is separate from `ROAD_DATA_JOB_SECRET`.
Keep it out of browsers, URLs, reports, Git commits, and chat messages.

Send JSON with `Authorization: Bearer <ROAD_DATA_API_SECRET>` and one of:

```json
{ "kind": "pin", "longitude": -76.588748, "latitude": -11.910688 }
```

```json
{ "kind": "place", "name": "Puente Río Blanco" }
```

```json
{ "kind": "official_alerts" }
```

Send only the reference: no sender IDs, phone keys, message content, or media.
These repeatable reads do not store reports, change incidents, or send messages.
Unknown fields, invalid coordinates, non-JSON input, and oversized bodies are
rejected. Shared Zod schemas validate requests, repository JSON, and responses.

## TypeScript integration

Add `@peruroad/road-data` as a local dependency relative to B's own package
directory. Build it before installing/building the bot, and reinstall after
updates; see the package README. A bot in another language can use HTTP directly.

```ts
import {
  createRoadContextClient,
  loadRoadContextClientConfiguration,
} from "@peruroad/road-data/context";

const config = loadRoadContextClientConfiguration();
const roadData = createRoadContextClient({
  baseUrl: config.ROAD_DATA_API_URL,
  secret: config.ROAD_DATA_API_SECRET,
});

const result = await roadData.request({ kind: "place", name: "corcona" });
if (!result.ok) {
  // Reply through B's messaging provider with result.error.message.
} else if (result.value.kind === "location") {
  // Follow the confirmation/ambiguity rules below before attaching a segment.
}
```

Client calls use the shared eight-second HTTP wrapper, without automatic POST
retries or redirects, and return typed failures with visible Spanish fallbacks.
Schemas/types are exported from `@peruroad/road-data/context/contracts`, which
is browser-safe; the implementation/client entry point is server-only.

Run the explicit deployed read check using the ignored local configuration:

```sh
npm --prefix packages/road-data run road-context:check
```

It checks an exact landmark, ambiguity, an unknown name, an on-road pin, an
outside-corridor pin, and official context. It prints safe aggregate results,
with no messages or database writes.

## Location handling

| `status`           | Action in B                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `matched`          | Use `location.segmentId` and `location.geometryRevision` after user confirmation. `requiresConfirmation` remains true. |
| `ambiguous`        | Offer the returned candidates and ask which landmark, or request a shared pin.                                         |
| `not_found`        | Ask for a specific landmark or shared pin. Do not invent kilometers or silently use fuzzy matches.                     |
| `outside_corridor` | Explain that the pin is outside the captured PE-22 corridor; do not attach a segment.                                  |
| `unavailable`      | Give the short fallback and offer to retry later.                                                                      |

Longitude precedes latitude internally. Pins more than 500 m from the road are
rejected. Distances are measured along the captured geometry, and source-reported
kilometers remain unverified. The 67 candidates are bridges, SOS posts and a
toll station, not a complete town/local-alias list. Spatial proximity alone does
not verify a bridge's road association. See the [gazetteer notes](../data/pe22-gazetteer.md).

The server selects an explicit reviewed revision through optional
`ROAD_DATA_GEOMETRY_REVISION`, defaulting to the package's versioned PE-22
geometry. Test imports and historical revisions cannot silently become live.

## Freshness and official-source handling

Every result includes `state`, `servedAt`, `asOf`, `dataAgeMs`, and a short
Spanish `message`. `ready` means a validated repository read, not surveyed
geography or a safe road. During database failure, an initialized process can
return its validated in-memory cache as `stale`; a cold process returns
`unavailable` with HTTP 503. Cache persistence across serverless instances is
not guaranteed.

Official data becomes stale after 20 minutes without a complete poll. Returned
records were observed since that poll started, allowing one second of timestamp
rounding, and validity dates are re-evaluated against the current Lima date.
Archived-only records are excluded. A successful empty poll returns `ready`
with an empty array; a missing complete poll returns `unavailable`.
**An absent alert never establishes clearance:** `absenceDoesNotConfirmClearance`
is always true. B still owns dedupe, confidence, clearing and linking official
facts to community incidents.

| HTTP status     | Meaning                                                         |
| --------------- | --------------------------------------------------------------- |
| 200             | Valid result; inspect freshness `state` and location `status`.  |
| 400 / 413 / 415 | Invalid input, oversized body, or wrong media type.             |
| 401             | Missing/wrong read credential; never substitute the n8n secret. |
| 405             | Unsupported method.                                             |
| 503             | Unavailable context; show a fallback.                           |

## Remaining team connection

B must wire the signed WhatsApp webhook, extraction/grouping, report storage,
follow-ups, dedupe/confidence/clearing, and messaging provider. This interface
makes C's existing location and official-source inputs available for that work;
no real WhatsApp conversation has been verified through it yet.

The participant-approved [climate-exposure direction](../data/climate-exposure.md)
retains **driver WhatsApp alerts and live conditions**. Weather, catchment and
susceptibility inputs and the assessment service are prepared. The root application
now exposes `GET /api/exposure?horizonHours=24|72`; see the [assessment contract](../data/climate-exposure.md).
The existing road-context endpoint remains unchanged. Its alert-change contract,
departure planning and messaging integration are the next checkpoint; the public
exposure read keeps `automatedAlertUse: false` until that integration is designed.

B will consume C's versioned assessments for the driver's confirmed subscription
stretch. Keep three bases distinct: confirmed road-condition changes, estimated
climate-exposure advisories, and attributed valid official advisories. Community
reports retain verification labels. Messages include the relevant time window,
source/data age, reasons and map link. Preserve consent, opt-out, idempotency,
bundling and quiet hours; stale/incomplete assessments cannot cause a new automated
exposure escalation. No exposure decrease or missing incident clears a road.

Shared contracts and every consumer must be updated together before wiring those
messages. The logistic pipeline remains deferred research rather than a delivery
dependency. No new messaging capability or real delivery is claimed by this handoff.
