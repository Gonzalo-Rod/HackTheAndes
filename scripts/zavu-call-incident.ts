/**
 * Places a one-way text-to-speech call that reports the most relevant active SUTRAN PE-22
 * incident, then sends the same facts by WhatsApp. Only call a number whose owner consented.
 * Usage: npm run zavu:call-incident -- <E.164 number> [--dry-run]
 */
import { randomUUID } from "node:crypto";
import { roadContextResponseSchema } from "@peruroad/road-data/context/contracts";
import { loadZavuConfiguration } from "@/config/env";
import { database } from "@/db/pool";
import { composeIncidentCall } from "@/domain/messaging/incident-call";
import { createZavuClient } from "@/integrations/zavu/client";
import { createZavuVoiceCaller } from "@/integrations/zavu/voice";
import { createMessagingRoadContext } from "@/services/inbound/road-information";

/** Zavu synthesis voice language for Peruvian Spanish listeners. */
const CALL_LANGUAGE = "es-ES";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const to = args.find((arg) => !arg.startsWith("--"));
  if (!to || !/^\+\d{8,15}$/.test(to)) throw new Error("Pass the recipient in E.164 format, e.g. +51999999999");

  const requestId = randomUUID();
  const context = roadContextResponseSchema.parse(await createMessagingRoadContext().execute({ kind: "official_alerts" }, requestId));
  if (context.kind !== "official_alerts") throw new Error("Unexpected road context response");
  const call = composeIncidentCall(context);
  if (!call.ok) {
    console.error(`No call placed: ${call.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Incident ${call.value.externalId}\nSpoken text:\n${call.value.spokenText}`);
  if (dryRun) return;

  const config = loadZavuConfiguration();
  // Keyed by incident and recipient so rerunning the script for the same incident does not dial again.
  const dedupeKey = `incident-call:${call.value.externalId}:${to}`;
  const placed = await createZavuVoiceCaller(config).placeTextToSpeechCall({
    to,
    text: call.value.spokenText,
    language: CALL_LANGUAGE,
    idempotencyKey: dedupeKey,
    requestId,
  });
  console.log(placed.ok ? `Call queued: ${placed.value.providerMessageId}` : `Call failed: ${placed.error}`);
  if (!placed.ok) {
    process.exitCode = 1;
    return;
  }

  const followUp = await createZavuClient(config).sendText({
    to,
    text: call.value.followUpText,
    channel: "whatsapp",
    idempotencyKey: `${dedupeKey}:whatsapp`,
    requestId,
  });
  console.log(followUp.ok ? `WhatsApp follow-up: ${followUp.value.providerMessageId}` : `WhatsApp follow-up failed: ${followUp.error}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  // The pool keeps the process alive until it is closed.
  .finally(() => database().end());
