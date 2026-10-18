import { beforeEach, it, expect, vi } from "vitest";
import { createWeeklyCommands } from "./commands";
import type { WeeklyPdfRepository } from "@/db/weekly-pdf";
import type { SubscriptionRepository } from "@/db/subscriptions";
import { syntheticWeeklyReport } from "@/test-fixtures/weekly-report";
const report = syntheticWeeklyReport(),
  now = Date.parse(report.generatedAt),
  id = "12345678-1234-4234-8234-123456789abc";
const repository = {
  targets: vi.fn(),
  latestPending: vi.fn(),
  claim: vi.fn(),
  save: vi.fn(),
  destination: vi.fn(),
  finish: vi.fn(),
  pdf: vi.fn(),
} satisfies WeeklyPdfRepository;
const preferences = { act: vi.fn(), bounds: vi.fn(), touch: vi.fn() } satisfies SubscriptionRepository;
const dispatch = vi.fn(),
  limiter = { consume: vi.fn() };
const commands = createWeeklyCommands({
  repository,
  preferences,
  dispatch,
  limiter,
  pepper: "synthetic-pepper",
  revision: report.range.geometryRevision,
  now: () => now,
});
const message = (text: string) => ({
  messageId: "synthetic-command",
  from: "US.synthetic-weekly",
  channel: "whatsapp",
  messageType: "text",
  text,
  content: null,
});
beforeEach(() => {
  vi.resetAllMocks();
  limiter.consume.mockResolvedValue(true);
  preferences.act.mockResolvedValue("Synthetic consent reply");
  repository.targets.mockResolvedValue([{ id, range: report.range, consentAt: new Date(now), isTest: true }]);
  repository.latestPending.mockResolvedValue(report.period);
  dispatch.mockResolvedValue("sent");
});
it("routes typed weekly consent without consuming global opt-out", async () => {
  await commands.handle(message("SEMANAL"), "r");
  expect(preferences.act).toHaveBeenCalledWith(
    expect.objectContaining({ action: { kind: "weeklyPrepare", code: expect.stringMatching(/^[A-F0-9]{8}$/) } }),
  );
  await commands.handle(message("SEMANAL ACTIVAR ABCDEF12"), "r");
  expect(preferences.act).toHaveBeenLastCalledWith(expect.objectContaining({ action: { kind: "weeklyActivate", code: "ABCDEF12" } }));
  expect(await commands.handle(message("BAJA"), "r")).toBeNull();
});
it("requires separate opt-in and uses the saved pending report when requesting PDF", async () => {
  repository.targets.mockResolvedValueOnce([]);
  expect(await commands.handle(message("PDF"), "r")).toContain("autorización aparte");
  expect(dispatch).not.toHaveBeenCalled();
  expect(await commands.handle(message("PDF"), "r")).toContain("archivo adjunto");
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ id }), report.period, "r");
});
it("limits document generation and never claims success for pending delivery", async () => {
  limiter.consume.mockResolvedValueOnce(false);
  expect(await commands.handle(message("PDF"), "r")).toContain("15 minutos");
  expect(dispatch).not.toHaveBeenCalled();
  dispatch.mockResolvedValue("pending");
  expect(await commands.handle(message("PDF"), "r")).toContain("no confirmamos");
});
