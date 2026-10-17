import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadDatabaseConfiguration, loadJobConfiguration } from "../src/config/env.ts";
import { createDatabasePool } from "../src/db/pool.ts";
import { createPostgresSutranJobHandler, jobOutcomeSchema } from "../src/jobs.ts";

// Explicit live check of the local handler, not a public deployment or an n8n execution.
const pool = createDatabasePool(loadDatabaseConfiguration());
const { ROAD_DATA_JOB_SECRET: secret } = loadJobConfiguration();
const handler = createPostgresSutranJobHandler({ pool, secret });
const request = (requestId: string, authenticated = true) =>
  new Request("http://localhost/api/jobs/sutran", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ requestId }),
  });
try {
  assert.equal((await handler(request(`check-${randomUUID()}`, false))).status, 401);
  const outcomes = [];
  for (let index = 0; index < 2; index++) {
    const requestId = `check-${randomUUID()}`;
    const response = await handler(request(requestId));
    assert.equal(
      response.status,
      200,
      "Live ingestion was not complete; inspect the safe job audit",
    );
    const outcome = jobOutcomeSchema.parse(await response.json());
    assert.equal(outcome.status, "complete");
    const repeated = await handler(request(requestId));
    assert.equal(repeated.status, 200);
    assert.deepEqual(await repeated.json(), outcome);
    outcomes.push(outcome);
  }
  console.log(
    JSON.stringify(
      {
        localHandlerVerified: true,
        unauthorizedStatus: 401,
        duplicateRequestsReuseAudit: true,
        outcomes,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      operation: "sutran.job.check",
      result: "failure",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message:
        "Local job verification did not complete. Inspect safe ingestion logs and the database audit.",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
