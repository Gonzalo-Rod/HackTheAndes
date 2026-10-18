/**
 * End-to-end route watch (F4) simulation on the real database and Zavu.
 *
 * 1. Registers a demonstration trip under the test organization: a mining truck from Huachipa to
 *    La Oroya that departed an hour ago, monitored from the given phone.
 * 2. Ranks the route's current incidents without calling, to show the state before the event.
 * 3. Publishes a simulated huaico ahead of the truck, marked `is_test` so it only reaches
 *    demonstration trips and is labeled DEMO on the dashboard.
 * 4. Evaluates again: the huaico ranks first and the monitor's phone is called.
 * 5. Clears the simulated huaico and completes the trip (skip with --keep).
 *
 * Only use a phone whose owner consented to the call.
 * Usage: npm run route-watch:simulate -- <E.164 phone> [--keep]
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadGeometryRevision, loadPlatformConfiguration } from "@/config/env";
import { database } from "@/db/pool";
import { createTripRepository } from "@/db/trips";
import { normalizePhone, phoneKey } from "@/integrations/security/contacts";
import { createDefaultRouteWatchEvaluator } from "@/services/route-watch/runtime";

/** Map-axis distances of the Huachipa bridge and La Oroya bridge (public.gazetteer). */
const ORIGIN_KM = 10.4;
const DESTINATION_KM = 173.9;
const TRUCK_SPEED_KMH = 35;
const DEPARTED_MINUTES_AGO = 60;
/** Near the Matucana bridge (km 75.4), about 30 km ahead of the truck's estimated position. */
const SIMULATED_HUAICO_KM = 75.4;
const SIMULATED_REPORT_MINUTES_AGO = 5;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const keep = args.includes("--keep");
  const destination = normalizePhone(args.find((arg) => !arg.startsWith("--")) ?? "");
  if (!destination) throw new Error("Pass a Peruvian mobile number, e.g. +51999999999");

  const pool = database();
  const platform = loadPlatformConfiguration();
  const revision = loadGeometryRevision();
  const key = phoneKey(destination, platform.PHONE_KEY_PEPPER);
  if (!key) throw new Error("Could not derive the phone key");
  const organization = await pool.query("select id from public.organizations where is_test order by id limit 1");
  const organizationId = z.uuid().parse(organization.rows[0]?.id);

  const now = Date.now();
  const trips = createTripRepository(pool, { key: platform.CONTACT_ENCRYPTION_KEY, version: platform.CONTACT_KEY_VERSION });
  const trip = await trips.create({
    phoneKey: key,
    destination,
    organizationId,
    originKm: ORIGIN_KM,
    destinationKm: DESTINATION_KM,
    departAt: new Date(now - DEPARTED_MINUTES_AGO * 60_000).toISOString(),
    avgSpeedKmh: TRUCK_SPEED_KMH,
    watchUntil: null,
    now: new Date(now).toISOString(),
  });
  console.log(
    `1. Trip ${trip.id} registered (${trip.status}): Huachipa → La Oroya, ${TRUCK_SPEED_KMH} km/h, departed ${DEPARTED_MINUTES_AGO} min ago.`,
  );

  const evaluate = createDefaultRouteWatchEvaluator();
  const before = await evaluate(randomUUID(), { tripId: trip.id, rankOnly: true });
  console.log(`2. Before the event, ranking only (SUTRAN ${before.officialState}):`, JSON.stringify(before.trips[0], null, 2));

  const segment = await pool.query(
    "select id from public.segments where geometry_revision=$1 and $2 between distance_from_origin_start_km and distance_from_origin_end_km order by distance_from_origin_start_km limit 1",
    [revision, SIMULATED_HUAICO_KM],
  );
  const segmentId = z.string().parse(segment.rows[0]?.id);
  const reportedAt = new Date(now - SIMULATED_REPORT_MINUTES_AGO * 60_000).toISOString();
  const incident = await pool.query(
    `insert into public.incidents(segment_id,road_code,type,origin,road_status,status,confidence,first_seen,last_confirmed,is_test)
     values($1,'PE-22','huaico','community','interrumpido','active',0.2,$2,$2,true) returning id`,
    [segmentId, reportedAt],
  );
  const incidentId = z.uuid().parse(incident.rows[0]?.id);
  console.log(`3. Simulated huaico ${incidentId} published on segment ${segmentId} (DEMO).`);

  try {
    const after = await evaluate(randomUUID(), { tripId: trip.id });
    console.log("4. After the event:", JSON.stringify(after.trips[0], null, 2));
  } finally {
    if (!keep) {
      await pool.query("update public.incidents set status='cleared' where id=$1 and is_test", [incidentId]);
      await trips.setStatus(trip.id, "completed");
      console.log("5. Simulated huaico cleared and trip completed.");
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  // The pool keeps the process alive until it is closed.
  .finally(() => database().end());
