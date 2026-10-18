import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRoadContextClient } from "../src/integrations/peruroad/road-context-client.ts";
import { loadRoadContextClientConfiguration } from "../src/config/env.ts";
import type { RoadContextRequest } from "../src/contracts/road-context.ts";
const config = loadRoadContextClientConfiguration();
const client = createRoadContextClient({
  baseUrl: config.ROAD_DATA_API_URL,
  secret: config.ROAD_DATA_API_SECRET,
});
const requestId = randomUUID();
const checks: { input: RoadContextRequest; status: string }[] = [
  { input: { kind: "place", name: "corcona" }, status: "matched" },
  { input: { kind: "place", name: "infiernillo" }, status: "ambiguous" },
  { input: { kind: "place", name: "Unlisted reference" }, status: "not_found" },
  { input: { kind: "pin", longitude: 0, latitude: 0 }, status: "outside_corridor" },
  { input: { kind: "pin", longitude: -76.588748, latitude: -11.910688 }, status: "matched" },
];
for (const [index, check] of checks.entries()) {
  const result = await client.request(check.input, { requestId: `${requestId}-${index}` });
  assert.ok(result.ok, "Road context request was not confirmed");
  assert.ok(result.value.kind === "location");
  assert.equal(result.value.status, check.status);
  assert.equal(result.value.requiresConfirmation, true);
}
const alerts = await client.request(
  { kind: "official_alerts" },
  { requestId: `${requestId}-official` },
);
assert.ok(alerts.ok, "Official context request was not confirmed");
assert.ok(alerts.value.kind === "official_alerts");
assert.equal(alerts.value.absenceDoesNotConfirmClearance, true);
console.log(
  JSON.stringify(
    {
      state: "ready",
      locationChecks: checks.length,
      officialAlertCount: alerts.value.alerts.length,
      officialState: alerts.value.state,
      lastCompletePollAt: alerts.value.asOf,
      dataAgeMs: alerts.value.dataAgeMs,
    },
    null,
    2,
  ),
);
