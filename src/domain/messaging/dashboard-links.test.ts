import { expect, it } from "vitest";
import { dashboardLink, parseRoadCode, readDashboardRoad, sameRoadCode, whatsAppChatLink } from "./dashboard-links";

it.each([
  ["PE-22", "PE-22"],
  ["pe 32", "PE-32"],
  ["PE32", "PE-32"],
  ["ruta pe-3nd", "PE-3ND"],
  ["  PE – 08b ", "PE-08B"],
])("reads %s as %s", (text, code) => expect(parseRoadCode(text)).toBe(code));

it("matches road codes regardless of zero padding", () => {
  expect(sameRoadCode("PE-8B", "PE-08B")).toBe(true);
  expect(sameRoadCode("pe-22", "PE-22")).toBe(true);
  expect(sameRoadCode("PE-2", "PE-22")).toBe(false);
});

it.each(["Chosica", "PE-", "PE-1234", "PE-22 Chosica", "km 22", ""])("rejects %s as a road code", (text) =>
  expect(parseRoadCode(text)).toBeNull(),
);

it("builds dashboard links with the parameters the dashboard reads", () => {
  expect(dashboardLink("https://example.test/", { view: "pronostico", road: "PE-32" })).toBe(
    "https://example.test/?vista=pronostico&carretera=PE-32",
  );
  expect(dashboardLink("https://example.test", { alert: "123" })).toBe("https://example.test/?alerta=123");
  expect(dashboardLink("https://example.test")).toBe("https://example.test/");
});

it("prefills a WhatsApp chat with the command, digits only in the number", () => {
  expect(whatsAppChatLink("+51 900 000 000", "ESTADO PE-22")).toBe("https://wa.me/51900000000?text=ESTADO%20PE-22");
});

it("reads the road from a dashboard URL and ignores anything else", () => {
  expect(readDashboardRoad("?carretera=pe-32&vista=pronostico")).toBe("PE-32");
  expect(readDashboardRoad("?carretera=<script>")).toBeNull();
  expect(readDashboardRoad("")).toBeNull();
});
