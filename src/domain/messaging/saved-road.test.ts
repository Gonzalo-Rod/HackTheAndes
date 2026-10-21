import { expect, it } from "vitest";
import { parseSavedRoadCommand } from "./saved-road";

it.each([
  ["GUARDAR CARRETERA PE-32", { kind: "save", roadCode: "PE-32" }],
  ["recordar carretera pe 22", { kind: "save", roadCode: "PE-22" }],
  ["  Guardar   carretera   PE-3ND ", { kind: "save", roadCode: "PE-3ND" }],
  ["GUARDAR CARRETERA", { kind: "save_invalid" }],
  ["GUARDAR CARRETERA Chosica", { kind: "save_invalid" }],
  ["mi carretera", { kind: "show" }],
  ["OLVIDAR CARRETERA", { kind: "forget" }],
  ["borrar carretera", { kind: "forget" }],
  ["ESTADO PERÚ", { kind: "national", query: "status" }],
  ["exposición todo", { kind: "national", query: "exposure" }],
  ["CLIMA NACIONAL", { kind: "national", query: "exposure" }],
])("parses %s", (text, expected) => {
  expect(parseSavedRoadCommand(text)).toEqual(expected);
});

it.each(["ESTADO", "ESTADO PE-22", "EXPOSICION Chosica", "RUTA PE-32", "REPORTE guardar carretera PE-22", "MI CARRETERA PE-22"])(
  "leaves %s to the existing commands",
  (text) => {
    expect(parseSavedRoadCommand(text)).toBeNull();
  },
);
