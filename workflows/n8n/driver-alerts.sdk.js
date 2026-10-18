import { workflow, node, trigger } from "@n8n/workflow-sdk";
const schedule = trigger({
  type: "n8n-nodes-base.scheduleTrigger",
  version: 1.4,
  config: {
    name: "Every 5 minutes (recovery)",
    parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 5 }] } },
    position: [0, 0],
  },
  output: [{}],
});
const manual = trigger({
  type: "n8n-nodes-base.manualTrigger",
  version: 1,
  config: { name: "Manual verification", position: [0, 200] },
  output: [{}],
});
const request = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Evaluate subscribed alerts",
    position: [300, 100],
    executeOnce: true,
    retryOnFail: false,
    onError: "stopWorkflow",
    credentials: { httpHeaderAuth: { id: "lQd0aYS0zCckQKI7", name: "PeruRoad ingestion job" } },
    parameters: {
      method: "POST",
      url: "https://peruroad-climate-git-feat-data-model-gozlie.vercel.app/api/jobs/alerts",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      options: {
        timeout: 170000,
        redirect: { redirect: { followRedirects: false } },
        response: { response: { responseFormat: "json" } },
      },
    },
  },
  output: [{ state: "example-only" }],
});
export default workflow("peruroad-driver-alerts", "PeruRoad — alert delivery recovery (5 minutes)")
  .add(schedule)
  .to(request)
  .add(manual)
  .to(request);
