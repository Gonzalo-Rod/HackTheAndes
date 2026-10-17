import { readFile, writeFile, rename } from "node:fs/promises";
import { historicalEventsSchema } from "../src/contracts/historical-events.ts";
const input: unknown = JSON.parse(
  await readFile(
    new URL("../data/.cache/historical-events-candidate.json", import.meta.url),
    "utf8",
  ),
);
const value = historicalEventsSchema.parse(input);
const target = new URL("../data/events/pe22-events.json", import.meta.url);
await writeFile(new URL(target.href + ".tmp"), JSON.stringify(value));
await rename(new URL(target.href + ".tmp"), target);
console.log(
  JSON.stringify({
    state: "validated",
    events: value.events.length,
    negativeExamples: 0,
    trainingReady: false,
  }),
);
