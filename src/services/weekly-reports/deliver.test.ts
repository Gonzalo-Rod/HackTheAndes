import { beforeEach, it, expect, vi } from "vitest";
import type { WeeklyPdfRepository } from "@/db/weekly-pdf";
import { createWeeklyDispatcher } from "./deliver";
import { syntheticWeeklyReport } from "@/test-fixtures/weekly-report";
const report = syntheticWeeklyReport(),
  now = Date.parse(report.generatedAt),
  id = "12345678-1234-4234-8234-123456789abc";
const target = { id, range: report.range, consentAt: new Date(now), isTest: true };
const delivery = { id, leaseId: id, period: report.period, expiresAt: new Date(now + 72 * 3_600_000), notifiedAt: null, report: null };
const repository = {
  targets: vi.fn(),
  activeRoadCode: vi.fn(),
  latestPending: vi.fn(),
  claim: vi.fn(),
  save: vi.fn(),
  destination: vi.fn(),
  finish: vi.fn(),
  pdf: vi.fn(),
} satisfies WeeklyPdfRepository;
const pdfSender = { sendPdf: vi.fn() },
  templates = { sendTemplate: vi.fn() },
  generate = vi.fn();
const dispatch = createWeeklyDispatcher({
  repository,
  pdfSender,
  templates,
  generate,
  publicUrl: "https://example.test",
  signingSecret: "synthetic-secret",
  now: () => now,
});
beforeEach(() => {
  vi.resetAllMocks();
  repository.claim.mockResolvedValue(delivery);
  repository.destination.mockResolvedValue({ to: "US.synthetic", windowOpen: true });
  generate.mockResolvedValue({ report, pdf: Buffer.from("%PDF-synthetic") });
  pdfSender.sendPdf.mockResolvedValue({ ok: true, value: { providerMessageId: "synthetic-message" } });
  templates.sendTemplate.mockResolvedValue({ ok: true, value: { providerMessageId: "synthetic-notice" } });
});
it("sends an attachment after durable persistence, with a stable provider key", async () => {
  expect(await dispatch(target, report.period, "synthetic-request")).toBe("sent");
  expect(repository.save).toHaveBeenCalledOnce();
  expect(pdfSender.sendPdf).toHaveBeenCalledWith(
    expect.objectContaining({ idempotencyKey: `weekly-pdf:v1:${id}:document`, filename: expect.stringMatching(/\.pdf$/) }),
  );
  expect(templates.sendTemplate).not.toHaveBeenCalled();
});
it("sends a reply-PDF notice outside the window without claiming PDF delivery", async () => {
  repository.destination.mockResolvedValue({ to: "US.synthetic", windowOpen: false });
  expect(await dispatch(target, report.period, "r")).toBe("notified");
  expect(pdfSender.sendPdf).not.toHaveBeenCalled();
  expect(repository.finish).toHaveBeenCalledWith(expect.anything(), "notified", null, now, "synthetic-notice");
});
it("keeps a pending unapproved template and suppresses repeated accepted notices", async () => {
  repository.destination.mockResolvedValue({ to: "US.synthetic", windowOpen: false });
  templates.sendTemplate.mockResolvedValue({ ok: false, error: "window_closed" });
  expect(await dispatch(target, report.period, "r")).toBe("pending");
  repository.claim.mockResolvedValue({ ...delivery, notifiedAt: new Date(now) });
  templates.sendTemplate.mockClear();
  expect(await dispatch(target, report.period, "r")).toBe("pending");
  expect(templates.sendTemplate).not.toHaveBeenCalled();
});
it("rechecks cancellation and uses saved report content on retry", async () => {
  repository.claim.mockResolvedValue({ ...delivery, report });
  repository.destination.mockResolvedValue(null);
  expect(await dispatch(target, report.period, "r")).toBe("cancelled");
  expect(generate).not.toHaveBeenCalled();
  expect(pdfSender.sendPdf).not.toHaveBeenCalled();
});
it("releases a failed generation lease without sending or marking success", async () => {
  generate.mockRejectedValue(new Error("Synthetic database outage"));
  expect(await dispatch(target, report.period, "r")).toBe("failed");
  expect(pdfSender.sendPdf).not.toHaveBeenCalled();
  expect(repository.finish).toHaveBeenCalledWith(delivery, "pending", "infrastructure_unavailable", now);
});
it("falls back to a template if the provider closes a locally open window", async () => {
  pdfSender.sendPdf.mockResolvedValue({ ok: false, error: "window_closed" });
  expect(await dispatch(target, report.period, "r")).toBe("notified");
});
