import type { Pool } from "pg";
import { z } from "zod";
import { AlertDetailResponseSchema, RoadAlertSchema } from "@/contracts/road-alerts";
import { SegmentsSchema, StatsSchema } from "@/contracts/platform";

export function createDashboardRepository(pool: Pick<Pool, "query">, geometryRevision: string) {
  return {
    async incidents() {
      const result = await pool.query(`select jsonb_build_object(
        'id','community:'||i.id,'code',left(i.id::text,8),'cause',case when i.type='accidente' then 'accidentes' when i.type in ('huaico','derrumbe','inundación') then 'fenomenos_naturales' when i.type='obra' then 'infraestructura' when i.type='bloqueo' then 'humano' else 'otro' end,
        'roadStatus',case when i.road_status='unknown' then 'desconocido' else i.road_status end,
        'title',i.type||case when i.origin='community' then ' · no confirmado' else '' end||case when i.is_test then ' · DEMO' else '' end,
        'description',case when i.origin='community' then 'Reporte comunitario. No confirmado por una autoridad.' else 'Registro operativo; consulta la fuente y su estado.' end,
        'currentSituation',i.status,'lat',extensions.st_y(i.location),'lng',extensions.st_x(i.location),
        'region','','regionKey','','province','','district','','roadCode',i.road_code,'roadName','Carretera Central',
        'kmText','Ubicación por coordenadas; km oficial sin calibrar','km',null,'kmEnd',null,'direction','',
        'pnpActions',null,'detainedPassengers',0,'detainedGoods',0,'eventDate',to_char(i.first_seen at time zone 'America/Lima','YYYY-MM-DD'),
        'validFrom',null,'validUntil',null,'administrator','','source',case when i.is_test then 'Demostración' when i.origin='community' then 'Comunidad · no confirmado' else 'Registro operativo' end,
        'sourceUrl',null,'reportCount',(select count(distinct r.reporter_key) from public.incident_reports ir join public.reports r on r.id=ir.report_id where ir.incident_id=i.id),
        'lastActionAt',to_char(i.last_confirmed at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as alert
        from public.incidents i where i.road_code='PE-22' and i.status<>'cleared' and i.location is not null
        order by i.last_confirmed desc limit 1000`);
      return z
        .array(z.object({ alert: RoadAlertSchema }))
        .parse(result.rows)
        .map((row) => row.alert);
    },
    async incidentDetail(id: string) {
      const exists = await pool.query("select id from public.incidents where id=$1 and road_code='PE-22'", [id]);
      if (!exists.rowCount) return null;
      const result = await pool.query(
        `select to_char(observed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as date,
        source as type,case when road_status='unknown' then 'desconocido' else road_status end as "newStatus"
        from public.incident_status_log where incident_id=$1 order by observed_at limit 100`,
        [id],
      );
      return AlertDetailResponseSchema.parse({
        id: `community:${id}`,
        subcause: null,
        tags: ["Registro operativo"],
        evidence: [],
        history: result.rows,
        fetchedAt: new Date().toISOString(),
      });
    },
    async segments(revision: string = geometryRevision) {
      const result = await pool.query(
        `select jsonb_build_object('type','FeatureCollection','geometryRevision',r.id,
        'distanceReference','geometry_distance','retrievedAt',to_char(r.retrieved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'features',coalesce(jsonb_agg(jsonb_build_object('type','Feature','id',s.id,'geometry',extensions.st_asgeojson(s.geometry)::jsonb,
        'properties',jsonb_build_object('startDistanceKm',s.distance_from_origin_start_km,'endDistanceKm',s.distance_from_origin_end_km,
        'elevationM',s.elevation_m,'officialKmStart',s.official_km_start,'officialKmEnd',s.official_km_end,'kilometerCalibration',s.kilometer_calibration)) order by s.distance_from_origin_start_km),'[]'::jsonb)) as data
        from public.geometry_revisions r join public.segments s on s.geometry_revision=r.id where r.id=$1 group by r.id`,
        [revision],
      );
      return SegmentsSchema.parse(result.rows[0]?.data);
    },
    async stats(excludedPhoneKeys: readonly string[], now: string) {
      const result = await pool.query(
        `with real_reports as (
        select reporter_key from public.reports where not is_team and not is_test and not(reporter_key=any($1::text[]))
      ), real_subscriptions as (
        select distinct phone_key from public.subscriptions where not is_team and not is_test and opted_out_at is null and route_active and alert_expires_at>now() and (alert_payment_id is not null or is_test) and not(phone_key=any($1::text[]))
      ), real_queries as (
        select phone_key from private.usage_events where kind='query_answered' and not is_team and not is_test and not is_automated and not(phone_key=any($1::text[]))
      ), real_activity as (
        select reporter_key as phone_key from real_reports union all select phone_key from real_queries
      ) select jsonb_build_object(
        'queriesAnswered',(select count(*) from real_queries),
        'returningUsers',(select count(*) from (select phone_key from real_activity group by phone_key having count(*)>1) x),
        'reports',(select count(*) from real_reports), 'uniqueReporters',(select count(distinct reporter_key) from real_reports),
        'returningReporters',(select count(*) from (select reporter_key from real_reports group by reporter_key having count(*)>1) x),
        'subscribers',(select count(*) from real_subscriptions),
        'companiesOnWaitlist',(select count(distinct lower(trim(w.company))) from public.waitlist w join private.delivery_contacts c on c.id=w.contact_ref where not w.is_team and not w.is_test and not(c.phone_key=any($1::text[]))),
        'dispatchDecisions',(select count(*) from public.dispatch_decisions d left join public.organizations o on o.id=d.organization_id where not d.is_team and not d.is_test and not coalesce(o.is_team,false) and not coalesce(o.is_test,false) and not(coalesce(d.phone_key,'')=any($1::text[]))),
        'callsPlaced',(select count(*) from public.calls c join public.trips t on t.id=c.trip_id left join public.organizations o on o.id=t.organization_id where not t.is_team and not t.is_test and not coalesce(o.is_team,false) and not coalesce(o.is_test,false) and not(t.phone_key=any($1::text[]))),
        'callsAnswered',(select count(*) from public.calls c join public.trips t on t.id=c.trip_id left join public.organizations o on o.id=t.organization_id where c.status='answered' and not t.is_team and not t.is_test and not coalesce(o.is_team,false) and not coalesce(o.is_test,false) and not(t.phone_key=any($1::text[])))) as data`,
        [excludedPhoneKeys],
      );
      return StatsSchema.parse({
        ...z.record(z.string(), z.unknown()).parse(result.rows[0]?.data),
        asOf: now,
        exclusions: [
          "team",
          "test",
          "configured phone keys",
          "ingestion jobs and API traffic",
          "interviews are not instrumented; returning users count report/query activity",
        ],
      });
    },
  };
}
export type DashboardRepository = ReturnType<typeof createDashboardRepository>;
