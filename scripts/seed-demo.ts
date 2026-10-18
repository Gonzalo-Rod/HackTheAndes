import { loadDemoSeedConfiguration, loadPlatformConfiguration } from "../src/config/env";
import { database } from "../src/db/pool";
import { keyedDigest } from "../src/integrations/security/contacts";

async function main() {
  const DEMO_ORGANIZATION_ID = "32b97234-5ddf-4419-9512-a5f2a0268ed9";
  const DEMO_INCIDENT_ID = "15456f66-1833-490e-a217-f1470d22d03e";
  const config = loadPlatformConfiguration();
  const { code } = loadDemoSeedConfiguration();
  const pool = database();
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("begin");
    await client.query(
      `insert into public.organizations(id,name,access_code_hash,is_team,is_test) values($1,'PeruRoad demonstration',$2,true,true)
    on conflict(id) do update set access_code_hash=excluded.access_code_hash`,
      [DEMO_ORGANIZATION_ID, keyedDigest(code, config.SESSION_SIGNING_SECRET, "organization-code-v1")],
    );
    await client.query(
      `insert into public.passes(organization_id,plan,days,route,starts_at,expires_at,payment_method,payment_ref,amount_minor,status,is_test)
    values($1,'company_predictions',1,'{"road":"PE-22"}',now(),now()+interval '1 day','demo','peruroad-demo-company',0,'active',true)
    on conflict(payment_method,payment_ref) do update set starts_at=excluded.starts_at,expires_at=excluded.expires_at,status='active'`,
      [DEMO_ORGANIZATION_ID],
    );
    // An explicitly labeled demo pin exercises the dashboard path without fabricating a real report.
    await client.query(
      `insert into public.incidents(id,segment_id,road_code,type,origin,road_status,status,confidence,location,first_seen,last_confirmed,is_team,is_test)
    select $1,id,'PE-22','otro','community','unknown','active',0,extensions.st_lineinterpolatepoint(geometry,0.5),now(),now(),true,true
    from public.segments where geometry_revision=$2 order by distance_from_origin_start_km limit 1
    on conflict(id) do update set first_seen=excluded.first_seen,last_confirmed=excluded.last_confirmed`,
      [DEMO_INCIDENT_ID, "7cf50ab57642d874064bed07753c8783a705f9ae13cec6378c8bea1f72966c90"],
    );
    await client.query("commit");
    console.log(
      JSON.stringify({
        state: "seeded",
        organization: "demo",
        accessCode: "Read DEMO_ACCESS_CODE in local .env.local; never commit or publish it",
        durationHours: 24,
        testDataExcludedFromStats: true,
      }),
    );
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      discard = true;
    }
    console.error(JSON.stringify({ state: "seed_failed", errorType: error instanceof Error ? error.name : "UnknownError" }));
    process.exitCode = 1;
  } finally {
    client.release(discard);
    await pool.end();
  }
}
void main();
