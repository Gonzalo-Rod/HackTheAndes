# PE-22 catchment preparation

Verified October 17, 2026. This implements the Team Plan's **HydroBASINS fallback**,
not a DEM watershed delineated to each road crossing. It is preparation for the
risk model; no risk score or forecast skill is established here.

## Verified output

Updated October 18, 2026. The versioned `packages/road-data/data/pe22/catchments.json`
contains 13 coarse basin unions linking **all 174** road segments: 11 from the 68
mapped road/river intersections (`association: "river_crossing"`) and 2 from the
basin containing a segment's midpoint (`association: "containing_basin"`). There
are 299 area-weighted weather query points (170 unique). Every polygon is explicitly
low confidence. The October 17 version linked only 38 segments, because a link
required a mapped ANA river crossing.

Segments without a mapped crossing are linked to the level-12 basin covering their
midpoint, plus its upstream basins; most join a basin that already has a crossing.
This proxies the small quebradas and slopes draining onto the road, which the ANA
layer does not resolve, so the pour point of a containing-basin link is a road point,
not an outlet. One containing basin (about 7,000 km²) is the whole Rímac upstream of
the coastal segment; its rain is dominated by the upper basin.

The inputs are the canonical, measured PE-22 axis and these public datasets:

| Input | Source | Identity and interpretation |
| --- | --- | --- |
| HydroBASINS South America level 12, v1c | [Product](https://www.hydrosheds.org/products/hydrobasins), [ZIP](https://data.hydrosheds.org/file/HydroBASINS/standard/hybas_sa_lev12_v1c.zip) | SHA-256 `50afa9deb75d9fd5d61b5f43fa92586f0bdfe5242018a1f2fbe5a1837871d37c`; provider SHA-1 `df1af8946486e49cc665e77f5e5dad37b6b6b55f`. |
| Unsimplified rivers/quebradas, ANA via SUTRAN | [GeoJSON](https://d1nmqibi58phlc.cloudfront.net/rios-quebradas-peru.geojson) | 1,225 source features; capture time and normalized JSON SHA-256 are embedded in the output. No source feature name or official crossing identifier is supplied. |

Intersect rivers with the road **before** clipping display geometry. For each
crossing, find the containing level-12 basin and traverse reverse `NEXT_DOWN`
links to union its upstream basins. The result includes the **entire crossing
sub-basin**, including land downstream of the crossing. The first mapped crossing
is retained as a representative `pourPoint`, not a hydrologically delineated outlet.

Intersect a 0.1-degree sampling mesh with each polygon, retain an interior point
for every nonempty cell, and weight it by geodesic intersection area. This mesh is
a query strategy, not the weather model's resolution. Future weather ingestion
must retain the provider's actual grid and merge repeated returned grid cells.

Crossing associations use nearest canonical segments within 20 m in UTM 18S, preserving
boundary ties within 1 cm. These tolerances reconcile separately segmented source
geometry; they do not establish the accuracy of either map. Coordinates and areas
use WGS84. Mean slope remains `null`: midpoint elevation is not a slope surface.
Small quebradas, culverts and drainage works remain unresolved.

## Reproduce and import

Node.js 24 and Python 3.14 are required for preparation. Python is used offline
only; neither deployed Next.js application requires it.

```sh
npm --prefix packages/road-data ci
python3.14 -m venv packages/road-data/.venv
packages/road-data/.venv/bin/python -m pip install --only-binary=:all: -r packages/road-data/requirements-data.lock.txt
npm --prefix packages/road-data run catchments:download
npm --prefix packages/road-data run catchments:prepare
```

The download uses the shared HTTP integrations, bounded bytes, TLS verification,
timeouts and at most two retries. The pinned continental ZIP is about 73 MB and
stays in ignored `data/.cache/`; it is never part of a server deployment. After
a successful download, `catchments:prepare` runs without network access. A fresh
capture can change provenance timestamps, so byte-identical output is not promised.
Python writes a candidate, then TypeScript validates the complete contract before
replacing the small committed fallback. Review the diff before committing a refresh.

Apply the shared migrations with the existing operator instructions, import
canonical segments first, then run:

```sh
npm --prefix packages/road-data run db:import-catchments
npm --prefix packages/road-data run test:db
```

The importer is transactional, serializes imports for a geometry revision,
validates association ownership, preserves newer snapshots, and upserts source
identities. It replaces this source's links while retaining historical polygons
for future model references. SQL migration `20261017230200_catchment_provenance.sql`
is already applied to the team's Supabase; never edit an applied migration.

## Application use and visible fallback

Server entry point: `@peruroad/road-data/catchments`.
Browser-safe contract: `@peruroad/road-data/catchments/contracts`.
`GET /api/catchments` returns `{ data, meta }`, including source dates,
limitations, the geometry revision, and `database` or `snapshot` state. The map
uses neutral dashed boundaries and a separate visibility toggle; it never colors
these polygons as calculated risk.

| Failure | Visible behavior |
| --- | --- |
| Archive or river download unavailable/changed | Preparation fails explicitly; existing validated snapshot remains. No invented basin is generated. |
| Database read unavailable or missing | API serves the bundled, validated snapshot with its preparation date and low-confidence notice. |
| Database and bundled snapshot unavailable/invalid | API returns safe 503; dashboard displays a layer-unavailable message. |
| No mapped crossing for a segment | No association is returned; absence never produces a low-risk label. |

Unit tests cover upstream topology, cycles, missing identities, line overlaps,
area weights, polygon holes, boundary ties, invalid samples and source identities.
Database tests cover retries, rollback, obsolete links and stale refreshes.

## Attribution and terms

HydroBASINS: Lehner, B. and Grill, G. (2013), *Global river hydrography and network
routing*, [doi:10.1002/hyp.9740](https://doi.org/10.1002/hyp.9740).
HydroSHEDS v1: Lehner, B., Verdin, K. and Jarvis, A. (2008), *New global hydrography
derived from spaceborne elevation data*, Eos 89(10), 93–94.

The source is copyright WWF (2006–2022), used under its
[license, including Appendix A and attribution notice in Exhibit B](https://data.hydrosheds.org/file/technical-documentation/HydroSHEDS_TechDoc_v1_4.pdf#page=24).
It is not an unrestricted raw-data redistribution grant. This repository includes
only the corridor derivative and preparation code. Source and third-party rights
remain with their owners; the source terms apply when using or distributing the
material. WWF has not assessed this derivative and makes no assurance of its
accuracy, completeness, currency or fitness for a purpose. The dashboard and
snapshot preserve source attribution and link to the governing notice.
