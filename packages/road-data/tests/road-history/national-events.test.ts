import { expect, it } from "vitest";
import { nationalRoadEventsSchema } from "../../src/contracts/national-road-events.ts";
import { readBundledNationalRoadEvents } from "../../src/integrations/provias/national-events.ts";

const registry = await readBundledNationalRoadEvents();
const event = registry.events[0];

it("bundles a validated nationwide registry beyond PE-22", () => {
  expect(registry.coverage).toBe("incomplete");
  expect(new Set(registry.events.map((e) => e.roadCode)).size).toBeGreaterThan(1);
});

it("rejects events without a source capture, duplicates and unknown fields", () => {
  const base = { ...registry, events: [event] };
  expect(nationalRoadEventsSchema.safeParse(base).success).toBe(true);
  expect(
    nationalRoadEventsSchema.safeParse({ ...base, events: [{ ...event, sourceYear: 2099 }] })
      .success,
  ).toBe(false);
  expect(nationalRoadEventsSchema.safeParse({ ...base, events: [event, event] }).success).toBe(
    false,
  );
  expect(
    nationalRoadEventsSchema.safeParse({ ...base, events: [{ ...event, narrative: "x" }] }).success,
  ).toBe(false);
  expect(nationalRoadEventsSchema.safeParse({ ...base, coverage: "complete" }).success).toBe(false);
});
