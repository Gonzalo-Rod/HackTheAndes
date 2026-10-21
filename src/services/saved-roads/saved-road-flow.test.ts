import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { InboundMessageData } from "@/integrations/zavu/events";
import { SAVED_ROAD_REPLIES } from "@/domain/messaging/saved-road";
import { createAtomicMemoryRoadStore } from "@/integrations/atomicmemory/saved-road-store";
import { chooseReply, REPLIES, type InboundDependencies } from "@/services/inbound/handle-inbound-message";
import { createAtomicMemoryFixture } from "@/test-fixtures/atomic-memory";
import { createSavedRoadFlow, memorySubject } from "./saved-road-flow";

// The WhatsApp workflow end to end: real command routing, flow and HTTP adapter against the
// in-process Atomic Memory fixture (no network, no credentials).

const PEPPER = "p".repeat(32);
const DRIVER = "+51 999 111 222";
const OTHER_DRIVER = "+51 999 333 444";
let clock = Date.parse("2026-10-20T12:00:00.000Z");

function setup() {
  const fixture = createAtomicMemoryFixture({ apiKey: "fixture-key", now: () => (clock += 1_000) });
  const store = createAtomicMemoryRoadStore(
    { apiUrl: "https://memory.test", apiKey: "fixture-key" },
    // Late-bound so a test can replace fixture.fetch to simulate an ambiguous provider answer.
    { fetchImpl: (input, init) => fixture.fetch(input, init), sleep: async () => undefined, random: () => 0 },
  );
  const information = {
    status: vi.fn(async (_requestId: string, query?: string | null) => (query ? `SUTRAN ${query}` : "SUTRAN Perú")),
    exposure: vi.fn(async (location: { place: string } | { latitude: number; longitude: number } | null) =>
      location && "place" in location ? `Exposición ${location.place}` : "Exposición Perú",
    ),
  };
  const deps: InboundDependencies = {
    messaging: { sendText: vi.fn() },
    information,
    intentParser: null,
    savedRoads: createSavedRoadFlow({ store, pepper: PEPPER }),
  };
  let sequence = 0;
  const send = (text: string, from = DRIVER, overrides: Partial<InboundMessageData> = {}) =>
    chooseReply(
      {
        messageId: `m${++sequence}`,
        from,
        channel: "whatsapp",
        messageType: "text",
        text,
        content: null,
        providerTimestamp: null,
        ...overrides,
      },
      deps,
      "req",
    );
  return { fixture, deps, information, send };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

it("saves an opted-in road and answers a later bare ESTADO and EXPOSICION for it", async () => {
  const { send, fixture } = setup();
  expect(await send("ESTADO")).toBe("SUTRAN Perú");
  expect(await send("GUARDAR CARRETERA PE-32")).toContain("Guardé PE-32 como tu carretera.");
  const status = await send("ESTADO");
  expect(status.startsWith("SUTRAN PE-32")).toBe(true);
  expect(status).toContain("Respondí por tu carretera guardada PE-32. ESTADO PERU muestra todo el país");
  expect(await send("EXPOSICION")).toContain("Exposición PE-32");
  expect(await send("MI CARRETERA")).toContain("Tu carretera guardada es PE-32.");
  // Explicit road and national queries keep their meaning.
  expect(await send("ESTADO PE-22")).toBe("SUTRAN PE-22");
  expect(await send("ESTADO PERU")).toBe("SUTRAN Perú");
  // Only a road code and a derived subject leave the server; never the phone number.
  expect(fixture.memories).toHaveLength(1);
  expect(JSON.stringify(fixture.memories)).not.toMatch(/999|\+51/);
  expect(fixture.memories[0]?.user_id).toBe(memorySubject(DRIVER, PEPPER));
});

it("corrects the saved road to one current record and reports the replacement", async () => {
  const { send, fixture } = setup();
  await send("GUARDAR CARRETERA PE-22");
  expect(await send("guardar carretera pe 32")).toContain("Reemplaza a PE-22.");
  expect(fixture.memories.map((memory) => memory.metadata.roadCode)).toEqual(["PE-32"]);
  expect(await send("ESTADO")).toContain("SUTRAN PE-32");
  expect(await send("GUARDAR CARRETERA PE-32")).toBe("PE-32 ya es tu carretera guardada. OLVIDAR CARRETERA la borra.");
});

it("removes stale duplicates left by a provider without externalId upserts", async () => {
  const { send, fixture } = setup();
  await send("GUARDAR CARRETERA PE-22");
  const first = fixture.memories[0];
  if (!first) throw new Error("fixture did not store the first save");
  first.metadata = { kind: "saved_road", roadCode: "PE-22" };
  expect(await send("GUARDAR CARRETERA PE-32")).toContain("Reemplaza a PE-22.");
  expect(fixture.memories.map((memory) => memory.metadata.roadCode)).toEqual(["PE-32"]);
});

it("deletes the saved road so ESTADO returns to the national answer", async () => {
  const { send, fixture } = setup();
  await send("GUARDAR CARRETERA PE-32");
  expect(await send("OLVIDAR CARRETERA")).toBe(SAVED_ROAD_REPLIES.forgotten);
  expect(fixture.memories).toHaveLength(0);
  expect(await send("ESTADO")).toBe("SUTRAN Perú");
  expect(await send("OLVIDAR CARRETERA")).toBe(SAVED_ROAD_REPLIES.none);
});

it("never shows one driver's saved road to another", async () => {
  const { send } = setup();
  await send("GUARDAR CARRETERA PE-32");
  expect(await send("ESTADO", OTHER_DRIVER)).toBe("SUTRAN Perú");
  expect(await send("MI CARRETERA", OTHER_DRIVER)).toBe(SAVED_ROAD_REPLIES.none);
  expect(await send("OLVIDAR CARRETERA", OTHER_DRIVER)).toBe(SAVED_ROAD_REPLIES.none);
  expect(await send("MI CARRETERA")).toContain("PE-32");
  // Formatting variants of one number are the same driver.
  expect(await send("MI CARRETERA", "999111222")).toContain("PE-32");
});

it("still answers, and says so, when Atomic Memory is down or slow", async () => {
  const { send, fixture } = setup();
  await send("GUARDAR CARRETERA PE-32");
  fixture.fail = "http_503";
  expect(await send("ESTADO")).toBe("No pude consultar tu carretera guardada; muestro la respuesta para todo el Perú.\nSUTRAN Perú");
  expect(await send("GUARDAR CARRETERA PE-22")).toBe(SAVED_ROAD_REPLIES.saveFailed);
  expect(await send("OLVIDAR CARRETERA")).toBe(SAVED_ROAD_REPLIES.forgetFailed);
  expect(await send("MI CARRETERA")).toBe(SAVED_ROAD_REPLIES.readFailed);
  fixture.fail = "timeout";
  expect(await send("EXPOSICION")).toContain("Exposición Perú");
  fixture.fail = "none";
  expect(await send("MI CARRETERA")).toContain("PE-32");
});

it("confirms an ambiguous save (connection lost after the write) by reading back", async () => {
  const { send, fixture } = setup();
  await send("GUARDAR CARRETERA PE-22");
  const realFetch = fixture.fetch;
  fixture.fetch = async (input, init) => {
    if (init?.method !== "POST") return realFetch(input, init);
    await realFetch(input, init);
    throw new Error("connection reset after write");
  };
  expect(await send("GUARDAR CARRETERA PE-32")).toContain("Guardé PE-32");
  expect(fixture.memories.map((memory) => memory.metadata.roadCode)).toEqual(["PE-32"]);
});

it("treats a 200 with no stored or updated IDs as unconfirmed and keeps the previous road", async () => {
  const { send, fixture } = setup();
  await send("GUARDAR CARRETERA PE-22");
  const realFetch = fixture.fetch;
  fixture.fetch = async (input, init) =>
    init?.method === "POST"
      ? new Response(JSON.stringify({ stored_memory_ids: [], updated_memory_ids: [] }), { status: 200 })
      : realFetch(input, init);
  expect(await send("GUARDAR CARRETERA PE-32")).toBe(SAVED_ROAD_REPLIES.saveFailed);
  expect(fixture.memories.map((memory) => memory.metadata.roadCode)).toEqual(["PE-22"]);
  expect(fixture.requests.some((request) => request.method === "DELETE")).toBe(false);
});

it("keeps the previous road when the list response is malformed instead of treating it as empty", async () => {
  const { send, fixture } = setup();
  await send("GUARDAR CARRETERA PE-22");
  const realFetch = fixture.fetch;
  fixture.fetch = async (input, init) =>
    init?.method === "GET" ? new Response(JSON.stringify({ results: [] }), { status: 200 }) : realFetch(input, init);
  expect(await send("OLVIDAR CARRETERA")).toBe(SAVED_ROAD_REPLIES.forgetFailed);
  expect(await send("GUARDAR CARRETERA PE-32")).toBe(SAVED_ROAD_REPLIES.saveFailed);
  expect(fixture.memories.map((memory) => memory.metadata.roadCode)).toEqual(["PE-22"]);
});

it("does not claim erasure when the provider answers 200 but keeps the record", async () => {
  const { send, fixture } = setup();
  await send("GUARDAR CARRETERA PE-22");
  fixture.fail = "delete_retains";
  expect(await send("OLVIDAR CARRETERA")).toBe(SAVED_ROAD_REPLIES.forgetFailed);
  expect(await send("MI CARRETERA")).toContain("PE-22");
  fixture.fail = "none";
  expect(await send("OLVIDAR CARRETERA")).toBe(SAVED_ROAD_REPLIES.forgotten);
  expect(fixture.memories).toHaveLength(0);
});

it("reports a kept previous road when replacing it cannot be confirmed", async () => {
  const { send, fixture } = setup();
  await send("GUARDAR CARRETERA PE-22");
  // Without the externalId upsert the new save is a second record, so the old one must be deleted.
  const first = fixture.memories[0];
  if (!first) throw new Error("fixture did not store the first save");
  first.metadata = { kind: "saved_road", roadCode: "PE-22" };
  fixture.fail = "delete_retains";
  expect(await send("GUARDAR CARRETERA PE-32")).toContain("pero no pude borrar PE-22");
  fixture.fail = "none";
  expect(await send("ESTADO")).toContain("SUTRAN PE-32");
});

it("does not let a voice transcript consent to saving, but can query", async () => {
  const { deps, fixture } = setup();
  const voiceDeps: InboundDependencies = {
    ...deps,
    voice: {
      convert: vi.fn(async (message: InboundMessageData) => ({
        ok: true as const,
        message: { ...message, messageType: "text", text: "guardar carretera PE-32" },
      })),
    },
  };
  const audio = { messageId: "a1", from: DRIVER, channel: "whatsapp", messageType: "audio", text: "", content: null };
  expect(await chooseReply(audio, voiceDeps, "req")).toBe(`Nota de voz interpretada. ${SAVED_ROAD_REPLIES.voice}`);
  expect(fixture.memories).toHaveLength(0);
});

it("is off by default: commands say nothing was saved and ESTADO is unchanged", async () => {
  const { deps } = setup();
  const disabled = { ...deps, savedRoads: undefined };
  const message = (text: string) => ({ messageId: text, from: DRIVER, channel: "whatsapp", messageType: "text", text, content: null });
  expect(await chooseReply(message("GUARDAR CARRETERA PE-32"), disabled, "req")).toBe(SAVED_ROAD_REPLIES.unavailable);
  expect(await chooseReply(message("ESTADO"), disabled, "req")).toBe("SUTRAN Perú");
  expect(await chooseReply(message("ESTADO PERU"), disabled, "req")).toBe("SUTRAN Perú");
  expect(await chooseReply(message("AYUDA"), disabled, "req")).toBe(REPLIES.help);
});
