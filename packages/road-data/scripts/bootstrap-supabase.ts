import { randomBytes } from "node:crypto";
import { readFile, writeFile, rename, chmod } from "node:fs/promises";
import {
  loadManagementConfiguration,
  loadOptionalDatabaseConfiguration,
} from "../src/config/env.ts";
import { createSupabaseManagementClient } from "../src/integrations/supabase/management.ts";
import { createAdminPool } from "../src/services/supabase-admin.ts";
import { createDatabasePool } from "../src/db/pool.ts";
import { z } from "zod";

const config = loadManagementConfiguration();
const management = createSupabaseManagementClient(config);
const admin = await createAdminPool(config);
const adminClient = await admin.connect();
try {
  await adminClient.query("begin");
  await adminClient.query("set local role postgres");
  const [keys, pooler] = await Promise.all([management.apiKeys(), management.pooler()]);
  const existing = loadOptionalDatabaseConfiguration();
  const role = z
    .array(z.object({ rolcanlogin: z.boolean() }))
    .parse(
      (
        await adminClient.query(
          "select rolcanlogin from pg_catalog.pg_roles where rolname = 'peruroad_backend'",
        )
      ).rows,
    )[0];
  if (!role) throw new Error("Apply database migrations before bootstrapping runtime credentials");
  const url = new URL(`postgresql://${pooler.db_host}:${pooler.db_port}/${pooler.db_name}`);
  url.username = `peruroad_backend.${config.SUPABASE_PROJECT_REF}`;
  if (existing && new URL(existing.DATABASE_URL).username !== url.username)
    throw new Error("Existing DATABASE_URL points at a different database role");
  if (role.rolcanlogin && !existing)
    throw new Error(
      "Backend login is already provisioned; obtain DATABASE_URL from the team instead of rotating it",
    );
  const password = existing
    ? decodeURIComponent(new URL(existing.DATABASE_URL).password)
    : randomBytes(32).toString("base64url");
  url.password = password;
  const settings = {
    SUPABASE_PROJECT_REF: config.SUPABASE_PROJECT_REF,
    SUPABASE_URL: `https://${config.SUPABASE_PROJECT_REF}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: keys.publishable,
    SUPABASE_SECRET_KEY: keys.secret,
    DATABASE_URL: url.toString(),
    DATABASE_SSL_MODE: "verify-full",
  };
  const destination = new URL("../.env.local", import.meta.url);
  let original = "";
  try {
    original = await readFile(destination, "utf8");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const retained = original
    .split("\n")
    .filter((line) => !Object.keys(settings).some((key) => line.startsWith(`${key}=`)))
    .filter(Boolean);
  const contents = [
    ...retained,
    ...Object.entries(settings).map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n");
  const temporary = new URL("../.env.local.bootstrap.tmp", import.meta.url);
  await writeFile(temporary, contents, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, destination);
  if (!role.rolcanlogin) {
    const query = z
      .array(z.object({ command: z.string() }))
      .parse(
        (
          await adminClient.query(
            "select format('alter role peruroad_backend login password %L', $1::text) as command",
            [password],
          )
        ).rows,
      )[0];
    if (!query) throw new Error("Could not prepare backend login");
    await adminClient.query(query.command);
  }
  await adminClient.query("commit");
  const runtime = createDatabasePool({
    DATABASE_URL: url.toString(),
    DATABASE_SSL_MODE: "verify-full",
  });
  try {
    await runtime.query("select 1");
  } finally {
    await runtime.end();
  }
  console.log(
    JSON.stringify({
      state: "configured",
      projectRef: config.SUPABASE_PROJECT_REF,
      keys: ["publishable", "secret"],
      databaseRole: "peruroad_backend",
      tls: "verified",
      credentialsFile: "packages/road-data/.env.local",
    }),
  );
} catch (error) {
  try {
    await adminClient.query("rollback");
  } catch {
    console.error(JSON.stringify({ state: "bootstrap_rollback_unavailable" }));
  }
  console.error(
    JSON.stringify({
      state: "bootstrap_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message: "Supabase setup was not confirmed; local credential values were not printed.",
    }),
  );
  process.exitCode = 1;
} finally {
  adminClient.release();
  await admin.end();
}
