import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";

const migrationRowSchema = z.array(
  z.object({ version: z.string(), statements: z.array(z.string()).nullable() }),
);

export async function applyMigrations(pool: Pool, directory: URL, dryRun = false) {
  const files = (await readdir(directory))
    .filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const client = await pool.connect();
  const applied: string[] = [];
  let discard = false;
  try {
    await client.query("begin");
    await client.query("set local role postgres");
    // Lock the whole deployment, including the first migration-history table creation.
    await client.query("select pg_advisory_xact_lock(hashtextextended('peruroad:migrations', 0))");
    await client.query("create schema if not exists supabase_migrations");
    await client.query(
      "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)",
    );
    const previous = migrationRowSchema.parse(
      (await client.query("select version, statements from supabase_migrations.schema_migrations"))
        .rows,
    );
    const history = new Map(previous.map((row) => [row.version, row.statements]));
    for (const file of files) {
      const version = file.slice(0, 14);
      const content = await readFile(new URL(file, directory), "utf8");
      if (history.has(version)) {
        if (history.get(version)?.join("\n") !== content)
          throw new Error(`Migration drift detected for ${version}`);
        continue;
      }
      await client.query(content);
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
        [version, file.slice(15, -4), [content]],
      );
      applied.push(`${file}:${createHash("sha256").update(content).digest("hex")}`);
    }
    await client.query(dryRun ? "rollback" : "commit");
    return { dryRun, applied, totalFiles: files.length };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      discard = true;
      throw new Error("Migration failed; connection was discarded after rollback failed");
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
