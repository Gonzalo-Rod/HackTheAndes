import type { EnvironmentalRecord } from "@/contracts/research_christian";
import { DAY_MS, limaDateToUtcMs } from "@/lib/time";

export type EvidenceTiming = { state: "valid" | "upcoming" | "expired" | "recorded" | "context" | "undated"; label: string };

function boundary(date: string, end: boolean): number {
  return date.length === 10 ? limaDateToUtcMs(date, 0) + (end ? DAY_MS - 1 : 0) : Date.parse(date);
}

export function evidenceTiming(record: EnvironmentalRecord, nowMs: number): EvidenceTiming {
  if (record.kind === "surveillance") return { state: "undated", label: "Referencia sin fecha" };
  if (record.kind === "scenario") return { state: "context", label: "Escenario estacional" };
  const linkedNotice = record.kind === "inventory";
  if (record.kind !== "forecast" && !linkedNotice)
    return { state: "recorded", label: record.kind === "report" ? "Reporte histórico" : "Observación del período" };
  if (!record.startsAt || !record.endsAt)
    return { state: "undated", label: linkedNotice ? "Vigencia del aviso sin verificar" : "Vigencia sin verificar" };
  if (nowMs < boundary(record.startsAt, false))
    return { state: "upcoming", label: linkedNotice ? "Aviso asociado próximo" : "Pronóstico próximo" };
  if (nowMs > boundary(record.endsAt, true))
    return { state: "expired", label: linkedNotice ? "Aviso asociado vencido" : "Pronóstico vencido" };
  return { state: "valid", label: linkedNotice ? "Aviso asociado vigente" : "Pronóstico vigente" };
}

const ORDER = { valid: 2, upcoming: 3, recorded: 4, context: 5, undated: 6, expired: 7 };
function sortPriority(record: EnvironmentalRecord, nowMs: number): number {
  const state = evidenceTiming(record, nowMs).state;
  const officialNotice =
    record.recordType === "short_term_hazard_notice" ||
    record.recordType === "precipitation_forecast_notice" ||
    record.recordType.startsWith("official_");
  if (officialNotice && (state === "valid" || state === "upcoming")) return state === "valid" ? 0 : 1;
  return ORDER[state];
}
export function sortEvidence(records: readonly EnvironmentalRecord[], nowMs: number): EnvironmentalRecord[] {
  return [...records].sort(
    (a, b) =>
      sortPriority(a, nowMs) - sortPriority(b, nowMs) ||
      (b.startsAt ?? b.issuedAt ?? "").localeCompare(a.startsAt ?? a.issuedAt ?? "") ||
      a.title.localeCompare(b.title),
  );
}

export interface EvidencePoint {
  id: string;
  coordinates: [number, number];
  recordIds: string[];
  label: string;
  category: "reference" | "critical-zone";
}

// Co-located station references share a published coordinate. Critical zones
// retain every original point; display grouping never changes source coordinates.
export function groupEvidencePoints(records: readonly EnvironmentalRecord[]): EvidencePoint[] {
  const groups = new Map<string, EvidencePoint>();
  for (const record of records) {
    if (!record.coordinates) continue;
    const category = record.recordType === "critical_zone_under_notice" ? "critical-zone" : "reference";
    const key = `${category}:` + (category === "critical-zone" ? record.id : record.coordinates.map((value) => value.toFixed(3)).join(","));
    const group = groups.get(key);
    if (group) group.recordIds.push(record.id);
    else groups.set(key, { id: key, coordinates: record.coordinates, recordIds: [record.id], label: record.location, category });
  }
  return [...groups.values()];
}
