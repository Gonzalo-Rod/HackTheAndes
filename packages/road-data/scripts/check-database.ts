import { z } from "zod";
import { loadDatabaseConfiguration, loadApiConfiguration } from "../src/config/env.ts";
import { createDatabasePool } from "../src/db/pool.ts";
import {
  createFetchJsonTransport,
  HttpTransportError,
} from "../src/integrations/http/json-transport.ts";

const pool = createDatabasePool(loadDatabaseConfiguration());
try {
  const result = await pool.query(
    "select (select count(*)::integer from public.segments) as segments, (select count(*)::integer from private.official_alerts) as official_alerts, (select count(*)::integer from private.official_alert_versions) as versions, (select count(*)::integer from private.official_alert_history) as history",
  );
  const counts = z
    .array(
      z.object({
        segments: z.number().int(),
        official_alerts: z.number().int(),
        versions: z.number().int(),
        history: z.number().int(),
      }),
    )
    .length(1)
    .parse(result.rows)[0];
  const api = loadApiConfiguration();
  const transport = createFetchJsonTransport();
  // Validate the publishable key separately: anonymous SQL privilege errors may be HTTP 401.
  z.object({ disable_signup: z.boolean() }).parse(
    await transport.getJson(`${api.SUPABASE_URL}/auth/v1/settings`, {
      provider: "supabase-api",
      headers: { apikey: api.SUPABASE_PUBLISHABLE_KEY },
    }),
  );
  const backend = await transport.getJson(
    `${api.SUPABASE_URL}/rest/v1/segments?select=id&limit=1`,
    { provider: "supabase-api", headers: { apikey: api.SUPABASE_SECRET_KEY } },
  );
  z.array(z.object({ id: z.string() })).parse(backend);
  for (const table of ["segments", "reports"]) {
    let denied = false;
    try {
      await transport.getJson(`${api.SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
        provider: "supabase-api",
        headers: { apikey: api.SUPABASE_PUBLISHABLE_KEY },
      });
    } catch (error) {
      if (!(error instanceof HttpTransportError) || ![401, 403].includes(error.status ?? 0))
        throw error;
      denied = true;
    }
    if (!denied) throw new Error("Unexpected browser-role access to an operational table");
  }
  console.log(
    JSON.stringify(
      {
        state: "ready",
        counts,
        backendApi: "verified",
        browserTableAccess: "denied",
        tls: "verified",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      state: "database_check_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message: "Database/API verification did not pass; inspect configuration and access policies.",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
