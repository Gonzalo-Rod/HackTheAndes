import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "vitest";
import { createRoadContextHandler } from "../../src/app/road-context-handler.ts";
import { roadContextResponseSchema } from "../../src/contracts/road-context.ts";

const secret = randomBytes(32).toString("base64url");
const response = roadContextResponseSchema.parse({
  kind: "location",
  status: "not_found",
  state: "ready",
  servedAt: "2026-10-17T22:00:00Z",
  asOf: null,
  dataAgeMs: null,
  message: "Comparte tu ubicación.",
  location: null,
  candidates: [],
  requiresConfirmation: true,
});
function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/internal/road-context", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}`, ...headers },
    body,
  });
}
test("missing/wrong read credentials never execute; the n8n credential is not accepted", async () => {
  let calls = 0;
  const handler = createRoadContextHandler({
    secret,
    logger: () => undefined,
    execute: async () => {
      calls++;
      return response;
    },
  });
  for (const authorization of [
    "",
    "Bearer invalid",
    `Bearer ${randomBytes(32).toString("base64url")}`,
  ])
    assert.equal((await handler(request("{}", { Authorization: authorization }))).status, 401);
  assert.equal(calls, 0);
});
test.each([
  ["{", 400],
  ['{"kind":"place","name":"corcona","phone_key":"sender"}', 400],
  ['{"kind":"pin","longitude":181,"latitude":0}', 400],
  [" ".repeat(1025), 413],
])("invalid input and body limits stop before the service", async (body, status) => {
  let calls = 0;
  const handler = createRoadContextHandler({
    secret,
    logger: () => undefined,
    execute: async () => {
      calls++;
      return response;
    },
  });
  assert.equal((await handler(request(String(body)))).status, status);
  assert.equal(calls, 0);
});
test("valid reads are repeatable and responses have correlation IDs and no-store", async () => {
  const handler = createRoadContextHandler({
    secret,
    logger: () => undefined,
    execute: async (input) => {
      assert.equal(input.kind, "place");
      return response;
    },
  });
  for (let index = 0; index < 2; index++) {
    const result = await handler(request('{"kind":"place","name":"corcona"}'));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.ok(result.headers.get("x-request-id"));
    assert.deepEqual(await result.json(), response);
  }
});
test("wrong methods/media types are rejected; infrastructure exceptions are safe", async () => {
  const logs: unknown[] = [];
  const handler = createRoadContextHandler({
    secret,
    logger: (entry) => logs.push(entry),
    execute: async () => {
      throw new Error(`password ${secret}`);
    },
  });
  assert.equal(
    (
      await handler(
        new Request("https://example.test", { headers: { Authorization: `Bearer ${secret}` } }),
      )
    ).status,
    405,
  );
  const unsupported = await handler(request("{}", { "Content-Type": "text/plain" }));
  assert.equal(unsupported.status, 415);
  const failed = await handler(request('{"kind":"official_alerts"}'));
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes(secret), false);
  assert.equal(JSON.stringify(logs).includes(secret), false);
});
