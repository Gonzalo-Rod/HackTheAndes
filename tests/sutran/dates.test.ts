import assert from "node:assert/strict";
import { test } from "vitest";
import { parseCalendarDate, parseKilometer } from "../../src/domain/road-data/parsing.ts";

test("parses calendar dates strictly, including century leap-year rules", () => {
  for (const [raw, expected] of [
    ["17/10/2026", "2026-10-17"],
    ["29/02/2024", "2024-02-29"],
    ["29/02/2000", "2000-02-29"],
    ["29/02/1900", null],
    ["31/04/2026", null],
    ["29/02/2025", null],
    ["00/10/2026", null],
    ["10/00/2026", null],
    ["10/13/2026", null],
    ["17/10/0000", null],
    ["2026-10-17", null],
    ["7/10/2026", null],
    ["", null],
  ] as const)
    assert.equal(parseCalendarDate(raw), expected, raw);
});

test("parses kilometer markers without guessing ranges or place names", () => {
  for (const [raw, expected] of [
    ["KM 51", 51],
    ["KM 64+800", 64.8],
    ["km. 64+005", 64.005],
    ["  64.8 ", 64.8],
    ["KM 64,8", 64.8],
    ["KM 0", 0],
    [null, null],
    ["KM 51-52", null],
    ["KM 64+1000", null],
    ["passing the bridge", null],
    ["", null],
    ["KM -1", null],
  ] as const)
    assert.equal(parseKilometer(raw), expected, String(raw));
});
