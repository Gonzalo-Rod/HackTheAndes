import { createExposureRepository } from "@peruroad/road-data/exposure";
import { loadGeometryRevision } from "@/config/env";
import { database } from "./pool";
export function readLatestExposure() {
  return createExposureRepository(database()).readLatest(loadGeometryRevision());
}
