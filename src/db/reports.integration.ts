import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";
import { database } from "./pool";
import { createReportRepository } from "./report-conversations";
import { createDashboardRepository } from "./dashboard";
import { loadGeometryRevision } from "@/config/env";
import { decryptContact } from "@/integrations/security/contacts";
import { reportDraftSchema, type ReportDraft, type ReportRouting } from "@/contracts/reports";
const pool = database();
const key = randomBytes(32).toString("base64url");
const revision = randomBytes(32).toString("hex");
const segmentId = `report-test-${randomUUID()}`;
const phones = [randomBytes(32).toString("hex"), randomBytes(32).toString("hex")];
const repository = createReportRepository(pool, { key, version: "report-test-v1" });
let position: [number, number];
const eventKey = () => createHash("sha256").update(randomUUID()).digest("hex");
beforeAll(async () => {
  await pool.query(
    "insert into public.geometry_revisions(id,road_code,retrieved_at,source_urls,source_snapshot,measured_length_km) values($1,'PE-22',now(),'{}','{}',1)",
    [revision],
  );
  const row = await pool.query(
    `insert into public.segments(id,geometry_revision,road_code,distance_from_origin_start_km,distance_from_origin_end_km,kilometer_calibration,source_references,geometry)
  select $1,$2,'PE-22',0,1,'unverified','[]',geometry from public.segments where geometry_revision=$3 limit 1
  returning extensions.st_x(extensions.st_lineinterpolatepoint(geometry,0.5)) as longitude,extensions.st_y(extensions.st_lineinterpolatepoint(geometry,0.5)) as latitude`,
    [segmentId, revision, loadGeometryRevision()],
  );
  const coords = z.object({ longitude: z.number(), latitude: z.number() }).parse(row.rows[0]);
  position = [coords.longitude, coords.latitude];
});
afterAll(async () => {
  try {
    await pool.query("delete from public.incident_status_log where incident_id in(select id from public.incidents where segment_id=$1)", [
      segmentId,
    ]);
    await pool.query("delete from public.incident_reports where incident_id in(select id from public.incidents where segment_id=$1)", [
      segmentId,
    ]);
    await pool.query("delete from public.incidents where segment_id=$1", [segmentId]);
    await pool.query("delete from public.reports where reporter_key=any($1::text[])", [phones]);
    await pool.query("delete from private.report_message_results where phone_key=any($1::text[])", [phones]);
    await pool.query("delete from private.report_conversations where phone_key=any($1::text[])", [phones]);
    await pool.query("delete from public.segments where id=$1", [segmentId]);
    await pool.query("delete from public.geometry_revisions where id=$1", [revision]);
  } finally {
    await pool.end();
  }
});
function draft(): ReportDraft {
  const now = Date.now();
  return reportDraftSchema.parse({
    id: randomUUID(),
    confirmationCode: "1234ABCD",
    sourceMessageId: `synthetic-${randomUUID()}`,
    receivedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30 * 60_000).toISOString(),
    rawText: "REPORTE PRUEBA Hay un derrumbe. Contacto sintético +51900000000",
    extraction: { type: "derrumbe", placeText: null, kilometer: null, direction: null, severity: null, lanesBlocked: 1, stillActive: true },
    location: { geometryRevision: revision, segmentId, snappedPosition: position, distanceFromOriginKm: 0.5, distanceFromRoadM: 0 },
    isTeam: true,
    isTest: true,
  });
}
it("atomically publishes once, preserves encrypted replay and deduplicates independent reporters", async () => {
  const first = draft();
  const firstEvent = eventKey();
  let incidentId = "";
  const result = await repository.run(phones[0] ?? "", async (session) => {
    await session.commit({
      eventKey: eventKey(),
      nextDraft: first,
      now: new Date().toISOString(),
      reply: () => ({ kind: "reply", text: "Pending" }),
    });
    expect(await session.readDraft()).toEqual(first);
    return session.commit({
      eventKey: firstEvent,
      nextDraft: null,
      publication: first,
      now: new Date().toISOString(),
      reply: (publication) => {
        if (!publication) throw new Error("Publication expected");
        incidentId = publication.incidentId;
        return { kind: "reply", text: `Recorded ${publication.incidentId}` };
      },
    });
  });
  expect(await repository.run(phones[0] ?? "", async (session) => session.replay(firstEvent))).toEqual(result);
  expect(await repository.run(phones[0] ?? "", async (session) => session.readDraft())).toBeNull();
  // A new message by the same person adds evidence but never a new independent reporter.
  for (const phone of phones) {
    await repository.run(phone, async (session) =>
      session.commit({
        eventKey: eventKey(),
        nextDraft: null,
        publication: draft(),
        now: new Date().toISOString(),
        reply: (publication) => {
          expect(publication?.incidentId).toBe(incidentId);
          expect(publication?.merged).toBe(true);
          return { kind: "reply", text: "Linked" };
        },
      }),
    );
  }
  const rows = await pool.query("select count(*)::integer as count from public.incidents where segment_id=$1", [segmentId]);
  expect(rows.rows[0]?.count).toBe(1);
  const feed = await createDashboardRepository(pool, revision).incidents();
  const marker = feed.find((item) => item.id === `community:${incidentId}`);
  expect(marker?.title).toContain("no confirmado");
  expect(marker?.source).toBe("Demostración");
  expect(marker?.roadStatus).toBe("desconocido");
  expect(marker?.reportCount).toBe(2);
  expect(JSON.stringify(marker)).not.toContain("900000000");
  const encrypted = await pool.query(
    'select raw_content_ciphertext as ciphertext,raw_content_iv as iv,raw_content_auth_tag as "authTag",key_version as "keyVersion" from public.reports where provider_message_id=$1',
    [first.sourceMessageId],
  );
  expect(decryptContact(encrypted.rows[0], key)).toBe(first.rawText);
  expect((encrypted.rows[0]?.ciphertext as Buffer).includes(Buffer.from(first.rawText))).toBe(false);
  const status = await pool.query("select road_status,confidence::double precision as confidence from public.incidents where id=$1", [
    incidentId,
  ]);
  expect(status.rows[0]).toEqual({ road_status: "unknown", confidence: 0.2 });
});
it("releases failed conversations, rejects concurrent/stale owners and denies browser access", async () => {
  const phone = phones[0] ?? "";
  await expect(
    repository.run(phone, async () => {
      throw new Error("synthetic outage");
    }),
  ).rejects.toThrow();
  await repository.run(phone, async (session) => {
    await expect(repository.run(phone, async () => undefined)).rejects.toThrow("busy");
    expect(pool.idleCount).toBe(pool.totalCount);
    const otherOwner = randomUUID();
    await pool.query("update private.report_conversations set lease_id=$2 where phone_key=$1", [phone, otherOwner]);
    await expect(
      session.commit({
        eventKey: eventKey(),
        nextDraft: null,
        publication: draft(),
        now: new Date().toISOString(),
        reply: (): ReportRouting => ({ kind: "reply", text: "must not publish" }),
      }),
    ).rejects.toThrow("lease expired");
  });
  await pool.query("update private.report_conversations set lease_until=clock_timestamp()-interval '1 second' where phone_key=$1", [phone]);
  expect(await repository.run(phone, async () => true)).toBe(true);
  const grants = await pool.query(
    "select has_table_privilege('anon','private.report_conversations','select') as drafts,has_table_privilege('authenticated','private.report_message_results','select') as replies",
  );
  expect(grants.rows[0]).toEqual({ drafts: false, replies: false });
});

it("serializes concurrent first publications without creating duplicate markers", async () => {
  const ids: string[] = [];
  await Promise.all(
    phones.map((phone) =>
      repository.run(phone, async (session) => {
        const candidate = draft();
        candidate.extraction.type = "obra";
        candidate.rawText = "REPORTE PRUEBA Hay obras";
        return session.commit({
          eventKey: eventKey(),
          nextDraft: null,
          publication: candidate,
          now: new Date(Date.now() - 1000).toISOString(),
          reply: (publication) => {
            if (!publication) throw new Error("Publication expected");
            ids.push(publication.incidentId);
            return { kind: "reply", text: "Recorded" };
          },
        });
      }),
    ),
  );
  expect(new Set(ids).size).toBe(1);
});
