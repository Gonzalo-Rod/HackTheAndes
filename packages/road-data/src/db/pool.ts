import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { DatabaseConfiguration } from "../config/env.ts";

// Small per-process pool for serverless integration; transaction work never performs HTTP.
const MAX_CONNECTIONS = 4;
const CONNECTION_TIMEOUT_MS = 8_000;
const IDLE_TIMEOUT_MS = 10_000;
export function createDatabasePool(config: DatabaseConfiguration): Pool {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl:
      config.DATABASE_SSL_MODE === "disable"
        ? false
        : {
            rejectUnauthorized: true,
            ca: readFileSync(
              new URL("../../certs/supabase-prod-ca-2021.crt", import.meta.url),
              "utf8",
            ),
          },
    max: MAX_CONNECTIONS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    statement_timeout: 8_000,
  });
  pool.on("error", () =>
    console.error(
      JSON.stringify({
        requestId: randomUUID(),
        operation: "db.pool",
        provider: "supabase",
        durationMs: 0,
        result: "failure",
        errorType: "idle_connection_failed",
      }),
    ),
  );
  return pool;
}
