import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SUTRAN_ALERT_PE22 } from "@/test/fixtures/sutran";

import { loadBundledAlertsSnapshot, parseAlertsSnapshot } from "./snapshot";

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => undefined));
afterEach(() => vi.restoreAllMocks());

describe("parseAlertsSnapshot", () => {
  it("returns validated records with the capture time", () => {
    const snapshot = parseAlertsSnapshot({ capturedAt: "2026-10-17T19:53:45.465Z", source: "x", records: [SUTRAN_ALERT_PE22] });
    expect(snapshot).toEqual({ capturedAt: "2026-10-17T19:53:45.465Z", records: [expect.objectContaining({ id: SUTRAN_ALERT_PE22.id })] });
  });

  it("skips invalid records instead of using them", () => {
    const snapshot = parseAlertsSnapshot({ capturedAt: "2026-10-17T19:53:45.465Z", source: "x", records: [SUTRAN_ALERT_PE22, { id: 42 }] });
    expect(snapshot?.records).toHaveLength(1);
  });

  it("rejects a file without a valid capture time", () => {
    expect(parseAlertsSnapshot({ capturedAt: "ayer", source: "x", records: [] })).toBeNull();
    expect(parseAlertsSnapshot(null)).toBeNull();
  });

  it("loads the bundled snapshot file", () => {
    const snapshot = loadBundledAlertsSnapshot();
    expect(snapshot?.records.length).toBeGreaterThan(0);
  });
});
