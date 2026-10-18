import { workflow, node, trigger, expr } from "@n8n/workflow-sdk";
const monday = trigger({
  type: "n8n-nodes-base.scheduleTrigger",
  version: 1.4,
  config: {
    name: "Monday 07:00 Peru",
    parameters: {
      rule: {
        interval: [
          {
            field: "weeks",
            weeksInterval: 1,
            triggerAtDay: [1],
            triggerAtHour: 7,
            triggerAtMinute: 0,
          },
        ],
      },
    },
    position: [0, 0],
  },
  output: [{}],
});
const retries = trigger({
  type: "n8n-nodes-base.scheduleTrigger",
  version: 1.4,
  config: {
    name: "Retry pending PDFs (6 hours)",
    parameters: { rule: { interval: [{ field: "hours", hoursInterval: 6, triggerAtMinute: 10 }] } },
    position: [0, 200],
  },
  output: [{}],
});
const manual = trigger({
  type: "n8n-nodes-base.manualTrigger",
  version: 1,
  config: { name: "Manual DEMO verification", position: [0, 400] },
  output: [{}],
});
const request = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Generate and deliver opted-in PDFs",
    position: [340, 200],
    executeOnce: true,
    retryOnFail: false,
    onError: "stopWorkflow",
    credentials: { httpHeaderAuth: { id: "lQd0aYS0zCckQKI7", name: "PeruRoad ingestion job" } },
    parameters: {
      ...{
        method: "POST",
        url: "https://peruroad-climate-git-feat-data-model-gozlie.vercel.app/api/jobs/weekly-reports",
        authentication: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        sendBody: true,
        specifyBody: "json",
        options: {
          timeout: 170000,
          redirect: { redirect: { followRedirects: false } },
          response: { response: { responseFormat: "json" } },
        },
      },
      jsonBody: expr(
        '{{ JSON.stringify({mode: $prevNode.name === "Manual DEMO verification" ? "demo" : $prevNode.name === "Retry pending PDFs (6 hours)" ? "retry" : "weekly"}) }}',
      ),
    },
  },
  output: [{ mode: "example-only", checked: 0, sent: 0, notified: 0, pending: 0, failed: 0 }],
});
export default workflow("peruroad-weekly-environmental-pdf", "PeruRoad — weekly environmental PDFs")
  .add(monday)
  .to(request)
  .add(retries)
  .to(request)
  .add(manual)
  .to(request);
