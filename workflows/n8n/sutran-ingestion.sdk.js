import { workflow, node, trigger, sticky, newCredential, ifElse, expr } from "@n8n/workflow-sdk";

const schedule = trigger({
  type: "n8n-nodes-base.scheduleTrigger",
  version: 1.4,
  config: {
    name: "Every 10 minutes",
    parameters: {
      rule: { interval: [{ field: "minutes", minutesInterval: 10 }] },
    },
    position: [0, 100],
  },
  output: [{ timestamp: "2026-10-17T20:00:00.000Z" }],
});

const manual = trigger({
  type: "n8n-nodes-base.manualTrigger",
  version: 1,
  config: { name: "Manual verification", position: [0, 320] },
  output: [{}],
});

const ingest = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Archive SUTRAN through backend",
    executeOnce: true,
    retryOnFail: false,
    onError: "stopWorkflow",
    credentials: {
      httpHeaderAuth: newCredential("PeruRoad ingestion job"),
    },
    parameters: {
      method: "POST",
      url: "https://peruroad-api-git-feat-data-model-gozlie.vercel.app/api/jobs/sutran",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr('{{ JSON.stringify({ requestId: "n8n-sutran-" + $execution.id }) }}'),
      options: {
        timeout: 130000,
        allowUnauthorizedCerts: false,
        redirect: { redirect: { followRedirects: false } },
        response: {
          response: {
            fullResponse: true,
            neverError: false,
            responseFormat: "json",
          },
        },
      },
    },
    position: [320, 200],
  },
  output: [
    {
      statusCode: 200,
      body: {
        requestId: "example-only",
        status: "complete",
        counts: {
          selected: 0,
          inserted: 0,
          updated: 0,
          unchanged: 0,
          historyInserted: 0,
          failed: 0,
          conflicts: 0,
          sourceRejected: 0,
        },
      },
    },
  ],
});

const completed = ifElse({
  version: 2.3,
  config: {
    name: "Backend confirmed completion",
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: "",
          typeValidation: "strict",
        },
        combinator: "and",
        conditions: [
          {
            leftValue: expr("{{ $json.statusCode }}"),
            rightValue: 200,
            operator: { type: "number", operation: "equals" },
          },
          {
            leftValue: expr('{{ $json.body?.status ?? "invalid" }}'),
            rightValue: "complete",
            operator: { type: "string", operation: "equals" },
          },
        ],
      },
    },
    position: [640, 200],
  },
  output: [{ statusCode: 200, body: { status: "complete" } }],
});

const failed = node({
  type: "n8n-nodes-base.stopAndError",
  version: 1,
  config: {
    name: "Fail unconfirmed ingestion",
    parameters: {
      errorType: "errorMessage",
      errorMessage:
        "SUTRAN ingestion was not confirmed. Inspect the backend audit using this execution ID; the next scheduled run can retry pending source records.",
    },
    position: [960, 320],
  },
  output: [],
});

const setup = sticky(
  "## SUTRAN archive — every 10 minutes\nCalls the deployed HTTPS /api/jobs/sutran endpoint using the saved PeruRoad ingestion job Header Auth credential. Keep job secrets only in the credential store and database credentials only in the backend.\n\nOnly HTTP 200 with status complete succeeds. Partial results and HTTP failures stop the workflow visibly; there are no automatic POST retries. Each execution has its own backend audit ID.\n\nLive manual executions 4 and 5 were verified against Supabase on October 17, 2026. Timezone: America/Lima; HTTP timeout: 130 seconds; workflow timeout: 150 seconds. Verify automatic executions after publishing. Weather/risk and alert evaluation remain separate pending work.",
  undefined,
  { position: [0, -320], width: 1200, height: 300, color: 5 },
);

export default workflow("peruroad-sutran-ingestion", "PeruRoad — SUTRAN ingestion (10 minutes)")
  .add(schedule)
  .to(ingest)
  .to(completed.onFalse(failed))
  .add(manual)
  .to(ingest)
  .add(setup)
  .group("SUTRAN archive", [ingest, completed, failed], {
    description: "Calls the authenticated backend and marks any unconfirmed ingestion as failed.",
  });
