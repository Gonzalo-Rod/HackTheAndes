import { createHash } from "node:crypto";
import { buildRoadCorridor } from "../domain/road-data/build-corridor.ts";

export function prepareRoadGeometry(snapshot: unknown) {
  return buildRoadCorridor(snapshot, (coordinates) =>
    createHash("sha256").update(JSON.stringify(coordinates)).digest("hex"),
  );
}
