import { readFile } from "node:fs/promises";
import path from "node:path";
import { CorridorDataSchema } from "@/contracts/corridor";
export async function readBundledCorridor() {
  return CorridorDataSchema.parse(JSON.parse(await readFile(path.join(process.cwd(), "public/data/pe22.json"), "utf8")));
}
