import { createExposureRepository } from "@peruroad/road-data/exposure";
import { loadGeometryRevision } from "@/config/env";
import { database } from "./pool";
export function readLatestExposure(geometryRevision: string = loadGeometryRevision()) {
  return createExposureRepository(database()).readLatest(geometryRevision);
}
