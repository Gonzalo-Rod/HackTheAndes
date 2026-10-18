import { catchmentSnapshotSchema } from "../../contracts/road-catchments.ts";
import { PILOT_ROAD_CODE } from "../../contracts/road-geometry.ts";
import { readRoadJson, roadFiles } from "../road-files.ts";
export async function loadBundledCatchments(roadCode: string = PILOT_ROAD_CODE) {
  return catchmentSnapshotSchema.parse(await readRoadJson(roadFiles(roadCode).catchments));
}
