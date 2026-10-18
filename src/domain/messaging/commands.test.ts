import { expect, it } from "vitest";
import { parseCommand, redactContactDetails } from "./commands";
it.each([
  ["estado", "status", null],
  ["  EXPOSICIÓN Matucana  ", "exposure", "Matucana"],
  ["CLIMA", "exposure", null],
  ["AVÍSAME", "subscribe", null],
  ["STOP", "unsubscribe", null],
  ["hola", "help", null],
])("parses %s deterministically", (text, kind, place) => expect(parseCommand(text ?? "")).toEqual({ kind, place }));
it("does not convert a narrative report into a command", () => expect(parseCommand("Hay un huaico en Chosica")).toBeNull());
it("removes obvious phone and email details before LLM processing", () =>
  expect(redactContactDetails("Llama +51 900 000 000 o contact@example.test")).toBe("Llama [contact] o [contact]"));
it.each([
  ["ESTADO PE-32", "PE-32"],
  ["estado pe 3nd", "pe 3nd"],
  ["STATUS PE22", "PE22"],
])("keeps the road code after %s for the national feed", (text, place) => expect(parseCommand(text)).toEqual({ kind: "status", place }));
it("sends free text after ESTADO to the intent parser instead of guessing a road", () =>
  expect(parseCommand("estado de la vía en Chosica")).toBeNull());
it("keeps a road code after EXPOSICION as the place", () =>
  expect(parseCommand("EXPOSICION PE-32")).toEqual({ kind: "exposure", place: "PE-32" }));
