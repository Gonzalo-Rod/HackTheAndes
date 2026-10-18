// Deep links from WhatsApp replies into the dashboard. The dashboard reads the same names through
// readDashboardLink (src/hooks/use-incident-dashboard.ts, use-climate-forecast.ts and Dashboard.tsx).

export const DASHBOARD_PARAMS = { view: "vista", road: "carretera", alert: "alerta" } as const;

/** National road codes as SUTRAN, MTC and the registry write them, e.g. PE-22 or PE-3ND. */
export const ROAD_CODE_PATTERN = /^PE-\d{1,3}[A-ZÑ]{0,3}$/;

/** Accepts "PE-32", "pe 32", "PE32" or "ruta PE-3ND"; anything else is not a road code. */
export function parseRoadCode(text: string): string | null {
  const match = /^\s*(?:(?:RUTA|CARRETERA|VIA)\s+)?PE\s*-?\s*(\d{1,3})\s*([A-ZÑ]{0,3})\s*$/iu.exec(
    text.normalize("NFC").replace(/[–—]/g, "-"),
  );
  if (!match) return null;
  const code = `PE-${match[1] ?? ""}${(match[2] ?? "").toUpperCase()}`;
  return ROAD_CODE_PATTERN.test(code) ? code : null;
}

/** Sources disagree on zero padding (the registry has PE-08B), so "PE-8B" and "PE-08B" are one road. */
export function sameRoadCode(a: string, b: string): boolean {
  const key = (code: string) => code.toUpperCase().replace(/^PE-0+(?=\d)/, "PE-");
  return key(a) === key(b);
}

export function dashboardLink(
  publicUrl: string,
  params: { view?: "pronostico" | "ambiente"; road?: string | null; alert?: string | null } = {},
): string {
  const url = new URL(publicUrl);
  if (params.view) url.searchParams.set(DASHBOARD_PARAMS.view, params.view);
  if (params.road) url.searchParams.set(DASHBOARD_PARAMS.road, params.road);
  if (params.alert) url.searchParams.set(DASHBOARD_PARAMS.alert, params.alert);
  return url.toString();
}

/** Road from a dashboard URL's query string, or null when absent or not a road code. */
export function readDashboardRoad(search: string): string | null {
  const value = new URLSearchParams(search).get(DASHBOARD_PARAMS.road);
  return value ? parseRoadCode(value) : null;
}

/** Opens a WhatsApp chat with the bot and a prefilled command the user still has to send. */
export function whatsAppChatLink(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
