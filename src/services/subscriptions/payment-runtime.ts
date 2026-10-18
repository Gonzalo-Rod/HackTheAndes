import { loadOpenAiConfiguration, loadPlatformConfiguration, loadQatomConfiguration } from "@/config/env";
import { createAlertPassRequestRepository } from "@/db/alert-pass-requests";
import { database } from "@/db/pool";
import { createQatomClient } from "@/integrations/qatom/client";
import { createOpenAiQatomCheckout } from "@/integrations/openai/qatom-checkout";
import { createAlertPassPayments } from "./alert-pass-payments";

let provider: ReturnType<typeof createOpenAiQatomCheckout> | undefined;
function checkoutProvider() {
  if (provider) return provider;
  const openai = loadOpenAiConfiguration();
  if (!openai) throw new Error("OPENAI_API_KEY is required for Qatom checkout");
  const qatom = loadQatomConfiguration();
  const client = createQatomClient(qatom);
  provider = createOpenAiQatomCheckout({
    apiKey: openai.apiKey,
    model: qatom.OPENAI_QATOM_MODEL,
    mcpUrl: qatom.QATOM_MCP_URL,
    itemId: qatom.QATOM_CATALOG_ITEM_ID,
    accessToken: (id) => client.accessToken(id),
  });
  return provider;
}
export function alertPassPayments() {
  const config = loadPlatformConfiguration();
  return createAlertPassPayments({
    repository: createAlertPassRequestRepository(database(), { key: config.CONTACT_ENCRYPTION_KEY, version: config.CONTACT_KEY_VERSION }),
    provider: { create: (id, traceId) => checkoutProvider().create(id, traceId) },
    now: Date.now,
  });
}
