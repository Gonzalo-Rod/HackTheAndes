import { readFile } from "node:fs/promises";
import { loadDatabaseConfiguration } from "../src/config/env.ts";
import { createDatabasePool } from "../src/db/pool.ts";
import { applyMigrations } from "../src/db/migrations.ts";

const config = loadDatabaseConfiguration();
const url = new URL(config.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/peruroad_test")
  throw new Error("CI bootstrap is restricted to a local disposable peruroad_test database");
const pool = createDatabasePool(config);
try {
  await pool.query(
    await readFile(new URL("../../../supabase/tests/bootstrap-ci.sql", import.meta.url), "utf8"),
  );
  console.log(
    JSON.stringify(
      await applyMigrations(pool, new URL("../../../supabase/migrations/", import.meta.url)),
    ),
  );
  await pool.query("alter role peruroad_backend login");
} finally {
  await pool.end();
}
