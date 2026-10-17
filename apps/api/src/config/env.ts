import "server-only";
import { loadDatabaseConfiguration } from "@peruroad/road-data/database";
import { loadJobConfiguration } from "@peruroad/road-data/jobs";

export function loadConfiguration() {
  return { ...loadDatabaseConfiguration(), ...loadJobConfiguration() };
}
