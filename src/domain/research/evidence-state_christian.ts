import type { EnvironmentalRecord } from "@/contracts/research_christian";
import { DAY_MS, limaDateToUtcMs } from "@/lib/time";

export type EvidenceTiming = { state: "valid" | "upcoming" | "expired" | "recorded" | "context" | "undated"; label: string };

function boundary(date: string, end: boolean): number {
  return date.length === 10 ? limaDateToUtcMs(date, 0) + (end ? DAY_MS - 1 : 0) : Date.parse(date);
}

export function evidenceTiming(record: EnvironmentalRecord, nowMs: number): EvidenceTiming {
  if (record.kind === "surveillance") return { state: "undated", label: "Referencia sin fecha" };
  if (record.kind === "scenario") return { state: "context", label: "Escenario estacional" };
  if (record.kind !== "forecast")
    return { state: "recorded", label: record.kind === "report" ? "Reporte histórico" : "Observación del período" };
  if (!record.startsAt || !record.endsAt) return { state: "undated", label: "Vigencia sin verificar" };
  if (nowMs < boundary(record.startsAt, false)) return { state: "upcoming", label: "Pronóstico próximo" };
  if (nowMs > boundary(record.endsAt, true)) return { state: "expired", label: "Pronóstico vencido" };
  return { state: "valid", label: "Pronóstico vigente" };
}

const ORDER = { valid: 2, upcoming: 3, recorded: 4, context: 5, undated: 6, expired: 7 };
function sortPriority(record: EnvironmentalRecord, nowMs: number): number {
  const state = evidenceTiming(record, nowMs).state;
  if (record.recordType.endsWith("notice") && (state === "valid" || state === "upcoming")) return state === "valid" ? 0 : 1;
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
}

// Nearby coordinates rounded to 0.001° share a marker. Keep an actual published
// coordinate instead of inventing a mean or moving a station onto the road.
export function groupEvidencePoints(records: readonly EnvironmentalRecord[]): EvidencePoint[] {
  const groups = new Map<string, EvidencePoint>();
  for (const record of records) {
    if (!record.coordinates) continue;
    const key = record.coordinates.map((value) => value.toFixed(3)).join(",");
    const group = groups.get(key);
    if (group) group.recordIds.push(record.id);
    else groups.set(key, { id: key, coordinates: record.coordinates, recordIds: [record.id], label: record.location });
  }
  return [...groups.values()];
}
