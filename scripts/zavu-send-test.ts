/**
 * Manual check of the outbound path: sends one text through the Zavu client.
 * Usage: npm run zavu:send-test -- <E.164 number> [sms|whatsapp]
 */
import { randomUUID } from "node:crypto";
import { loadZavuConfiguration } from "@/config/env";
import { createZavuClient } from "@/integrations/zavu/client";

async function main(): Promise<void> {
  const [to, channel = "whatsapp"] = process.argv.slice(2);
  if (!to || !/^\+\d{8,15}$/.test(to)) throw new Error("Pass the recipient in E.164 format, e.g. +51999999999");
  if (channel !== "sms" && channel !== "whatsapp") throw new Error("Channel must be sms or whatsapp");

  const config = loadZavuConfiguration();
  const result = await createZavuClient({ apiKey: config.apiKey, senderId: config.senderId }).sendText({
    to,
    text: "PeruRoad Climate: mensaje de prueba. Responde a este número para probar la recepción.",
    channel,
    idempotencyKey: `manual-test:${randomUUID()}`,
  });
  console.log(result.ok ? `Sent: ${result.value.providerMessageId}` : `Failed: ${result.error}`);
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
