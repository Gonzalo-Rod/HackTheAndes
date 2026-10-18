# National road events (Provías, display only)

Checked October 18, 2026. The dashboard shows past road emergencies across Peru so a current alert
can be read with its history ("this stretch had N interruptions in past rainy seasons"). These
records are **display-only context**: not current alerts, not training labels, and not a complete
inventory. The PE-22 candidate registry used by the deferred logistic research
([historical events](historical-events.md)) is unchanged.

## Source and preparation

The same anonymous Provías Nacional Excel exports used for PE-22 (January–April 2024 and 2025,
all departments) are captured with `npm --prefix packages/road-data run events:capture`. Then
`npm --prefix packages/road-data run events:prepare-national` runs a standard-library Python step
(`python/prepare_national_events.py`, no virtual environment needed) and validates the result with
Zod into `packages/road-data/data/events/national-events.json`.

Each row keeps the Provías code, date (Lima calendar day, no invented hour), exact road code,
department/province/district, official chainage, coordinates, the raw emergency type, a display
category (huaico, derrumbe, deslizamiento, inundación, road damage, structure damage, social,
traffic, other), the initial road state and whether the source text mentions rain. The long
`DESARROLLO` narrative is not stored; "mentions rain" is a source claim, not verified causation.
Coordinates outside a generous Peru bounding box are kept without a position. Changed columns,
non-numeric codes, duplicates or hash mismatches stop preparation.

The October 18 capture produced 1,487 events on 108 roads (666 in 2024, 821 in 2025), all with
coordinates and dates inside the requested windows.

## Use in the product

- `GET /api/history/road-events` serves the validated bundle with its capture time and an
  incomplete-coverage message.
- The alert detail lists emergencies on the **same road code** within 5 km of the alert
  (`src/domain/road-history/nearby.ts`), with counts of interruptions and rain mentions. Crossing
  roads never match. No nearby record is shown as "no record; not proof of safety".
- The optional map layer "Emergencias pasadas · Provías" draws the events (all of Peru, or PE-22 in
  the pilot scope), colored by natural hazard versus infrastructure damage.

## Visible fallback

| Provider | Failure | Visible result |
| --- | --- | --- |
| Provías bundle | File missing or fails validation | API returns `503 service_unavailable` without file paths; the detail panel says history is unavailable and does not imply the road has no history; the map layer stays disabled. |
| Provías export | Capture fails or columns change | Preparation stops; the previously committed bundle keeps serving with its original capture date. |
