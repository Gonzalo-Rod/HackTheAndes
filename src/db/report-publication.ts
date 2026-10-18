import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { reportDraftSchema, type ReportDraft, type ReportPublication } from "@/contracts/reports";
import { encryptContact } from "@/integrations/security/contacts";
import { REPORT_DEDUPE_DISTANCE_M, REPORT_DEDUPE_WINDOW_MS, UNCONFIRMED_REPORT_CONFIDENCE, selectDuplicate } from "@/domain/reports/policy";

/** Called inside the conversation/result transaction; no network calls or separate pool clients. */
export async function publishCommunityReport(
  client: PoolClient,
  input: ReportDraft,
  phoneKey: string,
  requestedAt: string,
  encryption: { key: string; version: string },
): Promise<ReportPublication> {
  const draft = reportDraftSchema.parse(input);
  if (
    !draft.location ||
    !draft.extraction.type ||
    draft.extraction.stillActive !== true ||
    Date.parse(draft.expiresAt) <= Date.parse(requestedAt)
  )
    throw new Error("Report is not publishable");
  const { location } = draft;
  const segment = await client.query("select id from public.segments where id=$1 and geometry_revision=$2", [
    location.segmentId,
    location.geometryRevision,
  ]);
  if (segment.rowCount !== 1) throw new Error("Report geometry is unavailable");
  // A short per-type lock prevents two reporters concurrently creating neighboring duplicates.
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `report:PE-22:${draft.extraction.type}:${draft.isTeam}:${draft.isTest}`,
  ]);
  // Use the database clock after serialization so an earlier-started concurrent
  // request can still match the incident just committed by the preceding request.
  const clock = await client.query(`select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as now`);
  const { now } = z.object({ now: z.iso.datetime() }).parse(clock.rows[0]);
  if (Date.parse(draft.expiresAt) <= Date.parse(now)) throw new Error("Report draft expired during publication");
  const previous = await client.query(
    'select ir.incident_id as "incidentId",r.id as "reportId" from public.reports r join public.incident_reports ir on ir.report_id=r.id where provider=\'zavu\' and provider_message_id=$1',
    [draft.sourceMessageId],
  );
  if (previous.rowCount) {
    const saved = z.object({ incidentId: z.uuid(), reportId: z.uuid() }).parse(previous.rows[0]);
    return { ...saved, merged: true, independentReporters: await reporterCount(client, saved.incidentId) };
  }
  const candidates = await client.query(
    `select i.id,to_char(i.first_seen at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "firstSeenAt",
     extensions.st_distance(i.location::extensions.geography,extensions.st_setsrid(extensions.st_makepoint($1,$2),4326)::extensions.geography) as "distanceM"
     from public.incidents i join public.segments s on s.id=i.segment_id
     where i.origin='community' and i.status='active' and i.type=$3 and s.geometry_revision=$4 and i.is_team=$5 and i.is_test=$6
     and i.first_seen >= $7::timestamptz-($8::integer*interval '1 millisecond')
     and extensions.st_dwithin(i.location::extensions.geography,extensions.st_setsrid(extensions.st_makepoint($1,$2),4326)::extensions.geography,$9)`,
    [
      ...location.snappedPosition,
      draft.extraction.type,
      location.geometryRevision,
      draft.isTeam,
      draft.isTest,
      now,
      REPORT_DEDUPE_WINDOW_MS,
      REPORT_DEDUPE_DISTANCE_M,
    ],
  );
  const parsed = z
    .array(z.object({ id: z.uuid(), distanceM: z.number().nonnegative(), firstSeenAt: z.iso.datetime() }))
    .parse(candidates.rows);
  const duplicate = selectDuplicate(parsed, Date.parse(now));
  const incidentId = duplicate ?? randomUUID();
  const reportId = randomUUID();
  const raw = encryptContact(draft.rawText, encryption.key, encryption.version);
  // Model output is a reporter's claim, never a source-confirmed road status or measured time.
  await client.query(
    `insert into public.reports(id,reporter_key,provider,provider_message_id,channel,
    raw_content_ciphertext,raw_content_iv,raw_content_auth_tag,key_version,location,extracted,observed_at,is_team,is_test)
    values($1,$2,'zavu',$3,'whatsapp',$4,$5,$6,$7,extensions.st_setsrid(extensions.st_makepoint($8,$9),4326),$10::jsonb,null,$11,$12)`,
    [
      reportId,
      phoneKey,
      draft.sourceMessageId,
      raw.ciphertext,
      raw.iv,
      raw.authTag,
      raw.keyVersion,
      ...location.snappedPosition,
      JSON.stringify({
        schemaVersion: 1,
        extraction: draft.extraction,
        location,
        confirmedAt: now,
        verification: "community_unconfirmed",
        observationTimeBasis: "not_supplied",
      }),
      draft.isTeam,
      draft.isTest,
    ],
  );
  if (!duplicate)
    await client.query(
      `insert into public.incidents(id,segment_id,road_code,type,origin,road_status,status,confidence,location,first_seen,last_confirmed,is_team,is_test)
    values($1,$2,'PE-22',$3,'community','unknown','active',$4,extensions.st_setsrid(extensions.st_makepoint($5,$6),4326),$7,$7,$8,$9)`,
      [
        incidentId,
        location.segmentId,
        draft.extraction.type,
        UNCONFIRMED_REPORT_CONFIDENCE,
        ...location.snappedPosition,
        now,
        draft.isTeam,
        draft.isTest,
      ],
    );
  else await client.query("update public.incidents set last_confirmed=$2 where id=$1", [incidentId, now]);
  await client.query("insert into public.incident_reports(incident_id,report_id) values($1,$2)", [incidentId, reportId]);
  await client.query(
    `insert into public.incident_status_log(incident_id,observed_at,road_status,status,source,source_event_key)
    values($1,$2,'unknown','active','community',$3)`,
    [incidentId, now, reportId],
  );
  return { incidentId, reportId, merged: duplicate !== null, independentReporters: await reporterCount(client, incidentId) };
}
async function reporterCount(client: PoolClient, incidentId: string): Promise<number> {
  const result = await client.query(
    "select count(distinct r.reporter_key)::integer as count from public.incident_reports ir join public.reports r on r.id=ir.report_id where ir.incident_id=$1",
    [incidentId],
  );
  return z.object({ count: z.number().int().positive() }).parse(result.rows[0]).count;
}
