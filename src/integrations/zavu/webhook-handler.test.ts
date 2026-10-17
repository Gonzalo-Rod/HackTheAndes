import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDeduplicator } from "@/services/inbound/memory-deduplicator";
import type { InboundMessageData } from "./events";
import { createZavuWebhookHandler } from "./webhook-handler";

const SECRET = "whsec_test_secret";
const NOW_MS = 1_800_000_000_000;

const inboundEvent = (id = "evt_1", data: Record<string, unknown> = {}) => ({
  id,
  type: "message.inbound",
  timestamp: NOW_MS,
  senderId: "sender_1",
  projectId: "prj_1",
  data: {
    messageId: "msg_1",
    from: "+51900000000",
    to: "+12232130807",
    channel: "whatsapp",
    messageType: "text",
    text: "Huaico en Matucana",
    profileName: null,
    providerTimestamp: NOW_MS - 1_000,
    ...data,
  },
});

function signedRequest(body: string, secret = SECRET): Request {
  const t = Math.floor(NOW_MS / 1000);
  const v2 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return new Request("https://app.test/api/webhooks/zavu", {
    method: "POST",
    headers: { "content-type": "application/json", "x-zavu-signature": `t=${t},v2=${v2}` },
    body,
  });
}

function setup(onInboundMessage?: (message: InboundMessageData) => Promise<void>) {
  const received: InboundMessageData[] = [];
  const tasks: Array<() => Promise<void>> = [];
  const handle = createZavuWebhookHandler({
    webhookSecret: SECRET,
    deduplicator: createMemoryDeduplicator(),
    onInboundMessage:
      onInboundMessage ??
      (async (message) => {
        received.push(message);
      }),
    defer: (task) => tasks.push(task),
    nowMs: () => NOW_MS,
  });
  const runDeferred = async () => {
    for (const task of tasks.splice(0)) await task();
  };
  return { handle, received, runDeferred };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("Zavu webhook handler", () => {
  it("accepts a signed inbound message and processes it after responding", async () => {
    const { handle, received, runDeferred } = setup();
    const response = await handle(signedRequest(JSON.stringify(inboundEvent())));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "processed" });
    expect(received).toHaveLength(0);
    await runDeferred();
    expect(received[0]).toMatchObject({ messageId: "msg_1", messageType: "text", text: "Huaico en Matucana" });
  });

  it("rejects a missing or wrong signature with 401 and does not process", async () => {
    const { handle, received, runDeferred } = setup();
    const body = JSON.stringify(inboundEvent());
    const unsigned = new Request("https://app.test/api/webhooks/zavu", { method: "POST", body });

    const response = await handle(unsigned);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "invalid_signature", message: "Invalid signature" } });
    expect((await handle(signedRequest(body, "whsec_other"))).status).toBe(401);
    await runDeferred();
    expect(received).toHaveLength(0);
  });

  it("handles a retried delivery of the same event only once", async () => {
    const { handle, received, runDeferred } = setup();
    const body = JSON.stringify(inboundEvent("evt_dup"));

    await handle(signedRequest(body));
    const retry = await handle(signedRequest(body));

    expect(await retry.json()).toEqual({ status: "duplicate" });
    await runDeferred();
    expect(received).toHaveLength(1);
  });

  it("acknowledges event types it does not handle without processing them", async () => {
    const { handle, received, runDeferred } = setup();
    const body = JSON.stringify({ id: "evt_2", type: "message.delivered", timestamp: NOW_MS, data: {} });

    expect(await (await handle(signedRequest(body))).json()).toEqual({ status: "ignored" });
    await runDeferred();
    expect(received).toHaveLength(0);
  });

  it("accepts a WhatsApp username ID (BSUID) as the sender", async () => {
    const { handle, received, runDeferred } = setup();
    await handle(signedRequest(JSON.stringify(inboundEvent("evt_3", { from: "PE.39995845583333834" }))));
    await runDeferred();
    expect(received[0]?.from).toBe("PE.39995845583333834");
  });

  it("parses location messages", async () => {
    const { handle, received, runDeferred } = setup();
    const event = inboundEvent("evt_4", {
      messageType: "location",
      text: "",
      content: { latitude: -11.84, longitude: -76.39, name: "Matucana" },
    });
    await handle(signedRequest(JSON.stringify(event)));
    await runDeferred();
    expect(received[0]?.content).toMatchObject({ latitude: -11.84, longitude: -76.39 });
  });

  it("returns 400 for signed bodies that are not valid events", async () => {
    const { handle } = setup();
    expect((await handle(signedRequest("not json"))).status).toBe(400);
    expect((await handle(signedRequest(JSON.stringify({ hello: "world" })))).status).toBe(400);
    const badMessage = JSON.stringify({ id: "evt_5", type: "message.inbound", timestamp: NOW_MS, data: { text: "x" } });
    expect((await handle(signedRequest(badMessage))).status).toBe(400);
  });

  it("rejects oversized bodies before verifying them", async () => {
    const { handle } = setup();
    expect((await handle(signedRequest("x".repeat(300 * 1024)))).status).toBe(413);
  });

  it("keeps the response successful and logs when processing fails", async () => {
    const { handle, runDeferred } = setup(async () => {
      throw new Error("boom");
    });
    const response = await handle(signedRequest(JSON.stringify(inboundEvent("evt_6"))));
    expect(response.status).toBe(200);
    await runDeferred();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"reason":"processing_failed"'));
  });
});
