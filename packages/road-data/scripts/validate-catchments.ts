import { readFile, writeFile, rename } from "node:fs/promises";
import { catchmentSnapshotSchema } from "../src/contracts/road-catchments.ts";
const candidate = JSON.parse(
  await readFile(new URL("../data/.cache/catchments-candidate.json", import.meta.url), "utf8"),
) as unknown;
const parsed = catchmentSnapshotSchema.safeParse(candidate);
if (!parsed.success) {
  console.error(
    JSON.stringify({
      state: "invalid_catchments",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    }),
  );
  process.exitCode = 1;
} else {
  const output = new URL("../data/pe22/catchments.json", import.meta.url);
  const temporary = new URL("../data/pe22/catchments.json.tmp", import.meta.url);
  await writeFile(temporary, JSON.stringify(parsed.data) + "\n");
  await rename(temporary, output);
  console.log(JSON.stringify({ state: "validated", ...parsed.data.diagnostics }));
}
