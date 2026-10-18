import { loadManagementConfiguration } from "../src/config/env.ts";
import { createAdminPool } from "../src/services/supabase-admin.ts";
import { applyMigrations } from "../src/db/migrations.ts";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--dry-run"))
  throw new Error("Usage: npm run db:migrate -- [--dry-run]");
const pool = await createAdminPool(loadManagementConfiguration());
try {
  const result = await applyMigrations(
    pool,
    new URL("../../../supabase/migrations/", import.meta.url),
    args.includes("--dry-run"),
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      state: "migration_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message: "Migration was not confirmed. Inspect migration history before retrying.",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
