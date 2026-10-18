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
