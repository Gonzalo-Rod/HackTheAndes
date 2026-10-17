import { createHash } from "node:crypto";
import { buildPe22Corridor } from "../domain/road-data/build-corridor.ts";

export function preparePe22Geometry(snapshot: unknown) {
  return buildPe22Corridor(snapshot, (coordinates) =>
    createHash("sha256").update(JSON.stringify(coordinates)).digest("hex"),
  );
}
