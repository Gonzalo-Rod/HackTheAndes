import type { ManagementConfiguration } from "../config/env.ts";
import { createSupabaseManagementClient } from "../integrations/supabase/management.ts";
import { createDatabasePool } from "../db/pool.ts";

export async function createAdminPool(config: ManagementConfiguration) {
  const client = createSupabaseManagementClient(config);
  const [pooler, role] = await Promise.all([client.pooler(), client.temporaryRole()]);
  const url = new URL(`postgresql://${pooler.db_host}:5432/${pooler.db_name}`);
  url.username = `${role.role}.${config.SUPABASE_PROJECT_REF}`;
  url.password = role.password;
  return createDatabasePool({ DATABASE_URL: url.toString(), DATABASE_SSL_MODE: "verify-full" });
}
