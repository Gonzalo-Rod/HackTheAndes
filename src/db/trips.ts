import type { Pool } from "pg";
import { z } from "zod";
import { decryptContact, encryptContact, EncryptedContactSchema } from "@/integrations/security/contacts";
import type { IncidentType, RoadStatus } from "@/domain/route-watch/prioritize";
import { INCIDENT_TYPES } from "@/domain/route-watch/prioritize";
import { transaction } from "./transaction";

// Storage for route watch (F4) on the existing trips and calls tables. Destinations are stored
// only encrypted and decrypted only here, on the call-sending path. A trip is a demonstration when
// its organization is a test organization or its phone is a configured test phone. The incident a
// call was about is kept in `calls.outcome.incidentKey`.

export interface NewTrip {
  phoneKey: string;
  destination: string;
  organizationId: string | null;
  originKm: number;
  destinationKm: number;
  departAt: string;
  avgSpeedKmh: number;
  now: string;
}

export interface StoredTrip {
  id: string;
  destination: string;
  originKm: number;
  destinationKm: number;
  departAt: string;
  avgSpeedKmh: number;
  status: "planned" | "active";
  isTest: boolean;
}

export interface CommunityIncidentRow {
  id: string;
  type: IncidentType;
  roadStatus: RoadStatus;
  confidence: number;
  isTest: boolean;
  lastConfirmed: string;
  startKm: number;
  endKm: number;
}

const tripRowSchema = z.object({
  id: z.uuid(),
  originKm: z.number(),
  destinationKm: z.number(),
  departAt: z.date(),
  avgSpeedKmh: z.number().positive(),
  status: z.enum(["planned", "active"]),
  isTest: z.boolean(),
  ciphertext: z.instanceof(Buffer),
  iv: z.instanceof(Buffer),
  authTag: z.instanceof(Buffer),
  keyVersion: z.string(),
});

export function createTripRepository(pool: Pool, encryption: { key: string; version: string }) {
  return {
    async corridorBounds(revision: string) {
      const result = await pool.query(
        'select min(distance_from_origin_start_km)::float8 as "startKm",max(distance_from_origin_end_km)::float8 as "endKm" from public.segments where geometry_revision=$1',
        [revision],
      );
      return z.object({ startKm: z.number().nonnegative(), endKm: z.number().positive() }).parse(result.rows[0]);
    },

    async create(trip: NewTrip): Promise<{ id: string; status: "planned" | "active" }> {
      return transaction(pool, async (client) => {
        const e = encryptContact(trip.destination, encryption.key, encryption.version);
        const contact = await client.query(
          `insert into private.delivery_contacts(phone_key,ciphertext,iv,auth_tag,key_version) values($1,$2,$3,$4,$5) on conflict(phone_key) do update set ciphertext=excluded.ciphertext,iv=excluded.iv,auth_tag=excluded.auth_tag,key_version=excluded.key_version,disabled_at=null returning id`,
          [trip.phoneKey, e.ciphertext, e.iv, e.authTag, e.keyVersion],
        );
        const status = Date.parse(trip.departAt) <= Date.parse(trip.now) ? "active" : "planned";
        const inserted = await client.query(
          `insert into public.trips(organization_id,contact_ref,phone_key,origin_km,destination_km,distance_reference,depart_at,avg_speed_kmh,status,call_consent_at)
           values($1,$2,$3,$4,$5,'geometry_distance',$6,$7,$8,$9) returning id`,
          [
            trip.organizationId,
            z.uuid().parse(contact.rows[0]?.id),
            trip.phoneKey,
            trip.originKm,
            trip.destinationKm,
            trip.departAt,
            trip.avgSpeedKmh,
            status,
            trip.now,
          ],
        );
        return { id: z.uuid().parse(inserted.rows[0]?.id), status };
      });
    },

    /** Trips with call consent whose contact has not opted out. */
    async watched(testPhoneKeys: readonly string[]): Promise<StoredTrip[]> {
      const result = await pool.query(
        `select t.id,t.origin_km::float8 as "originKm",t.destination_km::float8 as "destinationKm",t.depart_at as "departAt",
                t.avg_speed_kmh::float8 as "avgSpeedKmh",t.status,(coalesce(o.is_test,false) or t.phone_key=any($1::text[])) as "isTest",
                c.ciphertext,c.iv,c.auth_tag as "authTag",c.key_version as "keyVersion"
           from public.trips t join private.delivery_contacts c on c.id=t.contact_ref
           left join public.organizations o on o.id=t.organization_id
          where t.status in ('planned','active') and t.call_consent_at is not null and c.disabled_at is null
            and t.distance_reference='geometry_distance'`,
        [testPhoneKeys],
      );
      return z
        .array(tripRowSchema)
        .parse(result.rows)
        .map((row) => {
          const contact = EncryptedContactSchema.parse(row);
          if (contact.keyVersion !== encryption.version) throw new Error("Trip contact key version unavailable");
          return {
            id: row.id,
            destination: decryptContact(contact, encryption.key),
            originKm: row.originKm,
            destinationKm: row.destinationKm,
            departAt: row.departAt.toISOString(),
            avgSpeedKmh: row.avgSpeedKmh,
            status: row.status,
            isTest: row.isTest,
          };
        });
    },

    async setStatus(id: string, status: "active" | "completed" | "cancelled") {
      await pool.query("update public.trips set status=$2 where id=$1 and status in ('planned','active')", [id, status]);
    },

    async calledIncidentKeys(tripId: string): Promise<Set<string>> {
      const result = await pool.query(
        `select outcome->>'incidentKey' as "incidentKey" from public.calls where trip_id=$1 and purpose='alert' and outcome ? 'incidentKey'`,
        [tripId],
      );
      return new Set(
        z
          .array(z.object({ incidentKey: z.string() }))
          .parse(result.rows)
          .map((row) => row.incidentKey),
      );
    },

    /**
     * Idempotent: concurrent runs reuse one Zavu idempotency key, so a duplicate attempt gets the
     * same provider call ID and the unique (provider, provider_call_id) constraint drops it.
     */
    async recordCall(call: { tripId: string; incidentKey: string; incidentId: string | null; providerCallId: string; outcome: object }) {
      await pool.query(
        `insert into public.calls(trip_id,incident_id,provider,provider_call_id,purpose,status,outcome)
         values($1,$2,'zavu',$3,'alert','queued',$4::jsonb) on conflict do nothing`,
        [call.tripId, call.incidentId, call.providerCallId, JSON.stringify({ ...call.outcome, incidentKey: call.incidentKey })],
      );
    },

    async communityIncidents(revision: string, sinceIso: string, nowIso: string): Promise<CommunityIncidentRow[]> {
      const result = await pool.query(
        `select i.id,i.type,i.road_status as "roadStatus",i.confidence::float8 as confidence,i.is_test as "isTest",i.last_confirmed as "lastConfirmed",
                s.distance_from_origin_start_km::float8 as "startKm",s.distance_from_origin_end_km::float8 as "endKm"
           from public.incidents i join public.segments s on s.id=i.segment_id
          where i.origin in ('community','mixed') and i.status='active' and not i.is_team and s.geometry_revision=$1
            and i.last_confirmed>$2 and i.last_confirmed<=$3`,
        [revision, sinceIso, nowIso],
      );
      return z
        .array(
          z.object({
            id: z.uuid(),
            type: z.enum(INCIDENT_TYPES),
            roadStatus: z.enum(["interrumpido", "restringido", "normal", "unknown"]),
            confidence: z.number().min(0).max(1),
            isTest: z.boolean(),
            lastConfirmed: z.date().transform((value) => value.toISOString()),
            startKm: z.number(),
            endKm: z.number(),
          }),
        )
        .parse(result.rows);
    },
  };
}
export type TripRepository = ReturnType<typeof createTripRepository>;
