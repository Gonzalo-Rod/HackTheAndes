import { readFile, writeFile, rename } from "node:fs/promises";
import { nationalRoadEventsSchema } from "../src/contracts/national-road-events.ts";
const input: unknown = JSON.parse(
  await readFile(new URL("../data/.cache/national-events-candidate.json", import.meta.url), "utf8"),
);
const value = nationalRoadEventsSchema.parse(input);
const target = new URL("../data/events/national-events.json", import.meta.url);
await writeFile(new URL(target.href + ".tmp"), JSON.stringify(value));
await rename(new URL(target.href + ".tmp"), target);
console.log(JSON.stringify({ state: "validated", events: value.events.length }));
