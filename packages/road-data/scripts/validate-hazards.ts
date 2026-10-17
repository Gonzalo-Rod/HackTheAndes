import { readFile, writeFile, rename } from "node:fs/promises";
import { preparedHazardsSchema } from "../src/contracts/spatial-inputs.ts";
const value = preparedHazardsSchema.parse(
  JSON.parse(
    await readFile(new URL("../data/.cache/hazards-candidate.json", import.meta.url), "utf8"),
  ),
);
const target = new URL("../data/pe22/hazards.json", import.meta.url);
await writeFile(new URL(target.href + ".tmp"), JSON.stringify(value));
await rename(new URL(target.href + ".tmp"), target);
console.log(
  JSON.stringify({
    state: "validated",
    susceptibilityPolygons: value.susceptibility.features.length,
    warnings: value.warnings.features.length,
    segments: value.segmentExposure.length,
  }),
);
