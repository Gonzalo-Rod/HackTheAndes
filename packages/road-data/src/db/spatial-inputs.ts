import type { Pool } from "pg";
import { z } from "zod";
import {
  hazardCaptureSchema,
  preparedHazardsSchema,
  terrainCaptureSchema,
} from "../contracts/spatial-inputs.ts";
import { createDataSnapshotRepository } from "./data-snapshots.ts";
export async function persistHazards(pool: Pool, input: unknown, sourceInput: unknown) {
  const capture = preparedHazardsSchema.parse(input);
  const source = hazardCaptureSchema.parse(sourceInput);
  if (
    source.geometryRevision !== capture.geometryRevision ||
    source.capturedAt !== capture.capturedAt
  )
    throw new Error("Hazard source does not match prepared capture");
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `hazards:${capture.geometryRevision}`,
    ]);
    // A newer validated capture can replace an older payload even when its schema has evolved.
    const previous = await client.query(
      `select captured_at >= $2::timestamptz as preserve,
       jsonb_array_length(payload#>'{susceptibility,features}') as polygons,
       jsonb_array_length(payload#>'{warnings,features}') as warnings
       from public.data_snapshots where dataset='hazards' and snapshot_key='current' and geometry_revision=$1`,
      [capture.geometryRevision, capture.capturedAt],
    );
    const existing = z
      .array(
        z.object({
          preserve: z.boolean(),
          polygons: z.number().int().nonnegative(),
          warnings: z.number().int().nonnegative(),
        }),
      )
      .max(1)
      .parse(previous.rows)[0];
    if (existing?.preserve) {
      await client.query("commit");
      return {
        state: "preserved",
        hazardPolygons: existing.polygons,
        warnings: existing.warnings,
      };
    }
    // Keep model-independent official context; no derived risk classes are written here.
    await client.query(
      `insert into public.hazard_layers(provider,external_id,hazard_type,geometry,source_url,retrieved_at,properties,semantics_verified)
   select 'ingemmet',item->>'id','mass_movement_susceptibility',extensions.st_collectionextract(extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson((item->'geometry')::text),4326)),3),$2,$3,item->'properties',true
   from jsonb_array_elements($1::jsonb) item on conflict(provider,external_id) do update set geometry=excluded.geometry,retrieved_at=excluded.retrieved_at,properties=excluded.properties
   where hazard_layers.retrieved_at < excluded.retrieved_at`,
      [
        JSON.stringify(source.susceptibility.features),
        "https://geocatminnube.ingemmet.gob.pe/arcgis/rest/services/SERV_SUSCEPTIBLE_MOV_MASA_REGIONAL/MapServer/1",
        capture.capturedAt,
      ],
    );
    await client.query(
      `insert into public.official_warnings(provider,external_id,product,raw_level,geometry,provider_date,issued_at,valid_from,valid_until,source_url,retrieved_at,semantics_verified,payload)
   select 'senamhi',item->>'id','quebrada_activation',item#>>'{properties,rawLevel}',extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson((item->'geometry')::text),4326)),3)),
   (item#>>'{properties,providerDate}')::date,null,(item#>>'{properties,validFrom}')::timestamptz,(item#>>'{properties,validUntil}')::timestamptz,$2,$3,true,item->'properties'
   from jsonb_array_elements($1::jsonb) item on conflict(provider,product,external_id) do update set raw_level=excluded.raw_level,geometry=excluded.geometry,valid_from=excluded.valid_from,valid_until=excluded.valid_until,retrieved_at=excluded.retrieved_at,payload=excluded.payload
   where official_warnings.retrieved_at < excluded.retrieved_at`,
      [
        JSON.stringify(source.warnings.features),
        capture.warnings.sourceUrls[0],
        capture.capturedAt,
      ],
    );
    await createDataSnapshotRepository(client, hazardCaptureSchema).save({
      dataset: "hazard-source",
      key: "current",
      geometryRevision: source.geometryRevision,
      capturedAt: source.capturedAt,
      payload: source,
    });
    await createDataSnapshotRepository(client, preparedHazardsSchema).save({
      dataset: "hazards",
      key: "current",
      geometryRevision: capture.geometryRevision,
      capturedAt: capture.capturedAt,
      payload: capture,
    });
    await client.query("commit");
    return {
      state: "stored",
      hazardPolygons: capture.susceptibility.features.length,
      warnings: capture.warnings.features.length,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      discard = true;
    }
    throw new Error("Hazard persistence failed", { cause: error });
  } finally {
    client.release(discard);
  }
}
export async function persistTerrain(pool: Pool, input: unknown) {
  const capture = terrainCaptureSchema.parse(input);
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `terrain:${capture.geometryRevision}`,
    ]);
    const repository = createDataSnapshotRepository(client, terrainCaptureSchema);
    const existing = await repository.read(
      "catchment-terrain",
      capture.geometryRevision,
      "current",
    );
    if (existing && Date.parse(existing.capturedAt) >= Date.parse(capture.capturedAt)) {
      await client.query("commit");
      return { state: "preserved", catchments: existing.catchments.length };
    }
    for (const feature of capture.catchments) {
      const result = await client.query(
        `update public.catchments set mean_slope_degrees=$3,provenance=provenance||jsonb_build_object('terrain',$4::jsonb)
    where external_id=$1 and geometry_revision=$2`,
        [
          feature.catchmentId,
          capture.geometryRevision,
          feature.estimatedMeanSlopeDegrees,
          JSON.stringify({
            capturedAt: capture.capturedAt,
            method: capture.method,
            source: capture.source,
            demResolutionM: capture.demResolutionM,
          }),
        ],
      );
      if (result.rowCount !== 1) throw new Error("Terrain references an unknown catchment");
    }
    await createDataSnapshotRepository(client, terrainCaptureSchema).save({
      dataset: "catchment-terrain",
      key: "current",
      geometryRevision: capture.geometryRevision,
      capturedAt: capture.capturedAt,
      payload: capture,
    });
    await client.query("commit");
    return { state: "stored", catchments: capture.catchments.length };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      discard = true;
    }
    throw new Error("Terrain persistence failed", { cause: error });
  } finally {
    client.release(discard);
  }
}
