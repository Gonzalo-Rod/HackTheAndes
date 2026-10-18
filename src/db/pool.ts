import { createDatabasePool } from "@peruroad/road-data/database";
import { loadDatabaseConfiguration } from "@/config/env";
let pool: ReturnType<typeof createDatabasePool> | undefined;
export function database() {
  pool ??= createDatabasePool(loadDatabaseConfiguration());
  return pool;
}
