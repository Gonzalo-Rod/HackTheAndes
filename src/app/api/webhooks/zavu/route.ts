import { createZavuWebhook } from "@/services/inbound/zavu-webhook";
import { platformRoute } from "@/services/platform/http";

// The default Node runtime supports raw-body HMAC; cacheComponents disallows a runtime override.
export const maxDuration = 180;
let handle: ((request: Request) => Promise<Response>) | undefined;
export const POST = platformRoute("zavu.webhook.route", async (request) => {
  handle ??= createZavuWebhook();
  return handle(request);
});
