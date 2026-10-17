import { readFile } from "node:fs/promises";
import { catchmentSnapshotSchema } from "../../contracts/road-catchments.ts";
export async function loadBundledCatchments() {
  return catchmentSnapshotSchema.parse(
    JSON.parse(
      await readFile(new URL("../../../data/pe22/catchments.json", import.meta.url), "utf8"),
    ),
  );
}
