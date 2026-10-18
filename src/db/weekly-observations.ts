import type { Pool } from "pg";
import { z } from "zod";
import { storedOfficialAlertSchema, type ReportPeriod, type ReportRange } from "@peruroad/road-data/reports";
const countsSchema = z.object({
  firstRecordedAt: z.date().nullable(),
  officialEnvironmentalAlerts: z.number().int().nonnegative(),
  communityEnvironmentalIncidents: z.number().int().nonnegative(),
});
/** Read only aggregate counts; report text, contacts and reporter keys never enter a PDF or LLM request. */
export async function readWeeklyObservations(pool: Pool, range: ReportRange, period: ReportPeriod, isDemo: boolean) {
  const states = await pool.query("select state from private.official_alerts where source='sutran' limit 5001");
  const alerts = z
    .array(z.object({ state: storedOfficialAlertSchema }))
    .max(5000)
    .parse(states.rows);
  const points = alerts
    .filter(
      ({ state }) =>
        state.alert.roadCode === "PE-22" &&
        state.alert.location &&
        Date.parse(state.firstObservedAt) >= Date.parse(period.start) &&
        Date.parse(state.firstObservedAt) < Date.parse(period.end) &&
        /natural|fen.meno|huaico|derrumbe|inunda|lluvia/i.test(`${state.alert.cause} ${state.alert.title}`),
    )
    .map(({ state }) => ({ latitude: state.alert.location?.latitude, longitude: state.alert.location?.longitude }));
  const r = await pool.query(
    `with located_official as (
    select nearest.km,nearest.distance_m from jsonb_to_recordset($7::jsonb) as a(latitude float8,longitude float8)
    cross join lateral (
      select s.distance_from_origin_start_km + extensions.st_linelocatepoint(s.geometry,p.point)*(s.distance_from_origin_end_km-s.distance_from_origin_start_km) as km,
      extensions.st_distance(s.geometry::extensions.geography,p.point::extensions.geography) as distance_m
      from public.segments s cross join lateral (select extensions.st_setsrid(extensions.st_makepoint(a.longitude,a.latitude),4326) as point) p
      where s.geometry_revision=$1 order by s.geometry operator(extensions.<->) p.point limit 1
    ) nearest
 ) select
    (select min(started_at) from private.ingestion_runs where provider='sutran' and status='complete' and started_at<$5) as "firstRecordedAt",
    (select count(*)::int from located_official where distance_m<=500 and km >=$2 and km<=$3) as "officialEnvironmentalAlerts",
    (select count(*)::int from public.incidents i join public.segments s on s.id=i.segment_id
      where s.geometry_revision=$1 and s.distance_from_origin_end_km>$2 and s.distance_from_origin_start_km<$3
      and i.first_seen >=$4 and i.first_seen<$5 and i.type in ('huaico','derrumbe','inundación')
      and i.origin='community' and (not i.is_test or $6::boolean)
      and not exists(select 1 from public.incident_reports ir join public.reports rp on rp.id=ir.report_id where ir.incident_id=i.id and (rp.is_team or rp.is_test) and not $6::boolean)) as "communityEnvironmentalIncidents"`,
    [range.geometryRevision, range.startKm, range.endKm, period.start, period.end, isDemo, JSON.stringify(points)],
  );
  const data = countsSchema.parse(r.rows[0]);
  return { ...data, firstRecordedAt: data.firstRecordedAt?.toISOString() ?? null };
}
