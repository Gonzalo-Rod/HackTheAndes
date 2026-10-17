import { readCatchments } from "@peruroad/road-data/catchments";
import { database } from "./pool";
import { loadGeometryRevision } from "@/config/env";
export function readCatchmentSnapshot() {
  return readCatchments(database(), loadGeometryRevision());
}
