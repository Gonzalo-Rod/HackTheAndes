import { workflow, node, trigger } from "@n8n/workflow-sdk";
const schedule = trigger({
  type: "n8n-nodes-base.scheduleTrigger",
  version: 1.4,
  config: {
    name: "Every 60 minutes",
    parameters: { rule: { interval: [{ field: "hours", hoursInterval: 1 }] } },
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
    name: "Refresh climate inputs",
    position: [300, 100],
    executeOnce: true,
    retryOnFail: false,
    onError: "stopWorkflow",
    credentials: { httpHeaderAuth: { id: "lQd0aYS0zCckQKI7", name: "PeruRoad ingestion job" } },
    parameters: {
      method: "POST",
      url: "https://peruroad-climate-git-feat-data-model-gozlie.vercel.app/api/jobs/climate",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      options: {
        timeout: 110000,
        redirect: { redirect: { followRedirects: false } },
        response: { response: { responseFormat: "json" } },
      },
    },
  },
  output: [{ state: "example-only" }],
});
const notify = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.5,
  config: {
    name: "Deliver newly detected route alerts",
    position: [960, 80],
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
  output: [{ checked: 0, sent: 0, pending: 0, failed: 0 }],
});
export default workflow("peruroad-climate-refresh", "PeruRoad — climate-refresh (60 minutes)")
  .add(schedule)
  .to(request)
  .to(notify)
  .add(manual)
  .to(request)
  .to(notify);
