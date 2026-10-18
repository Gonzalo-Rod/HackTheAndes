import { readFile } from "node:fs/promises";
import { nationalRoadEventsSchema } from "../../contracts/national-road-events.ts";

export async function readBundledNationalRoadEvents() {
  return nationalRoadEventsSchema.parse(
    JSON.parse(
      await readFile(new URL("../../../data/events/national-events.json", import.meta.url), "utf8"),
    ),
  );
}
