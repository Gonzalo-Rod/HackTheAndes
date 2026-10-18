import { it, expect, vi } from "vitest";
import { createVoiceInput } from "./voice-input";
const message = { messageId: "synthetic-audio", from: "US.synthetic-contact", channel: "whatsapp", messageType: "audio", text: "" };
function setup(text: string | null = "REPORTE PRUEBA hay un derrumbe activo") {
  const cache = { read: vi.fn(async () => null as string | null), save: vi.fn(async () => {}) };
  const source = { download: vi.fn(async () => ({ bytes: new Uint8Array([1]), mimeType: "audio/ogg" })) };
  const transcriber = { transcribe: vi.fn(async () => text) };
  const quota = vi.fn(async () => true);
  return { cache, source, transcriber, quota, service: createVoiceInput({ cache, source, transcriber, quota }) };
}
it("converts a voice report to the existing text flow while retaining message identity", async () => {
  const s = setup();
  const r = await s.service.convert(message, "request");
  expect(r.ok && r.message).toMatchObject({ messageId: message.messageId, messageType: "text", text: expect.stringContaining("PRUEBA") });
  expect(s.cache.save).toHaveBeenCalledOnce();
});
it("reuses encrypted-cache content without another download or billable transcription", async () => {
  const s = setup();
  s.cache.read.mockResolvedValue("ESTADO");
  const r = await s.service.convert(message, "request");
  expect(r.ok && r.message.text).toBe("ESTADO");
  expect(s.source.download).not.toHaveBeenCalled();
});
it("answers visibly when transcription fails and publishes nothing", async () => {
  const s = setup(null);
  expect(await s.service.convert(message, "request")).toMatchObject({ ok: false, reply: expect.stringContaining("No se publicó") });
  expect(s.cache.save).not.toHaveBeenCalled();
});
it("limits audio costs before downloading", async () => {
  const s = setup();
  s.quota.mockResolvedValue(false);
  expect((await s.service.convert(message, "request")).ok).toBe(false);
  expect(s.source.download).not.toHaveBeenCalled();
});
it("handles an oversized or unavailable attachment", async () => {
  const s = setup();
  s.source.download.mockRejectedValue(new Error("Unavailable"));
  expect(await s.service.convert(message, "request")).toMatchObject({ ok: false, reply: expect.stringContaining("8 MB") });
});
it.each(["CONFIRMAR ABCDEF12", "ACTIVAR ABCDEF12", "RUTA ACTIVAR ABCDEF12", "SEMANAL ACTIVAR ABCDEF12"])(
  "requires typed confirmation instead of executing speech: %s",
  async (text) => {
    expect((await setup(text).service.convert(message, "request")).ok).toBe(false);
  },
);
