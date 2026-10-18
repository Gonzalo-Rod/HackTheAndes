import { expect, it } from "vitest";
import { normalizeExtraction, selectDuplicate, REPORT_DEDUPE_WINDOW_MS, UNCONFIRMED_REPORT_CONFIDENCE } from "./policy";
import type { ReportExtraction } from "@/contracts/reports";
const value: ReportExtraction = {
  type: "derrumbe",
  placeText: "Matucana",
  kilometer: null,
  direction: null,
  severity: null,
  lanesBlocked: null,
  stillActive: true,
};
it("discards an invented place rather than resolving it", () => expect(normalizeExtraction("Hay un derrumbe", value).placeText).toBeNull());
it("preserves a literal place without changing claim confidence", () => {
  expect(normalizeExtraction("Hay un derrumbe en MATUCANA", value).placeText).toBe("Matucana");
  expect(UNCONFIRMED_REPORT_CONFIDENCE).toBeLessThan(0.5);
});
it("deduplicates at exactly 2 km and 3 h, excluding older and future events", () => {
  const now = Date.parse("2026-10-18T03:00:00Z");
  const candidate = { id: "a", distanceM: 2000, firstSeenAt: new Date(now - REPORT_DEDUPE_WINDOW_MS).toISOString() };
  expect(selectDuplicate([candidate], now)).toBe("a");
  expect(selectDuplicate([{ ...candidate, distanceM: 2000.01 }], now)).toBeNull();
  expect(selectDuplicate([{ ...candidate, firstSeenAt: new Date(now - REPORT_DEDUPE_WINDOW_MS - 1).toISOString() }], now)).toBeNull();
  expect(selectDuplicate([{ ...candidate, firstSeenAt: new Date(now + 1).toISOString() }], now)).toBeNull();
});
