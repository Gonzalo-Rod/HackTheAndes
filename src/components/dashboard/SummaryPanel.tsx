"use client";

import { STATUS_META, STATUS_ORDER } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { AlertSummary } from "@/domain/road-alerts/filters";
import { formatRelative, plural } from "@/lib/format";

import type { Scope } from "./types";

interface SummaryPanelProps {
  summary: AlertSummary;
  scope: Scope;
  latestActionAt: string | null;
  now: number | null;
  filtered: boolean;
}

export function SummaryPanel({ summary, scope, latestActionAt, now, filtered }: SummaryPanelProps) {
  const statuses = STATUS_ORDER.filter((s) => s !== "desconocido" || summary.byStatus.desconocido > 0);
  const max = Math.max(1, ...statuses.map((s) => summary.byStatus[s]));
  return (
    <section className="pr-panel" aria-labelledby="summary-title">
      <header className="pr-panel__head">
        <h2 id="summary-title">{scope === "pe22" ? "Resumen · Carretera Central" : "Resumen nacional"}</h2>
        {filtered && <span className="pr-tag">Filtrado</span>}
      </header>
      <div className="pr-hero">
        <span className="pr-hero__value">{summary.total}</span>
        <span className="pr-hero__label">
          {summary.total === 1 ? "alerta vigente" : "alertas vigentes"}
          <span className="pr-muted">
            {" "}
            en {plural(summary.roadCount, "vía", "vías")} · {plural(summary.regionCount, "región", "regiones")}
          </span>
        </span>
      </div>
      <ul className="pr-statusbars">
        {statuses.map((status) => {
          const meta = STATUS_META[status];
          const value = summary.byStatus[status];
          return (
            <li key={status}>
              <span className="pr-status-glyph" style={{ background: meta.color, color: meta.ink }}>
                <Icon name={status} size={10} strokeWidth={2.6} />
              </span>
              <span className="pr-statusbars__label">
                {meta.label}
                <span className="pr-muted"> · {meta.description}</span>
              </span>
              <span className="pr-statusbars__value">{value}</span>
              <span className="pr-statusbars__track" aria-hidden="true">
                <span style={{ width: `${(value / max) * 100}%`, background: meta.color }} />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="pr-panel__foot">
        <Icon name="clock" size={12} />
        Última acción publicada por SUTRAN: {now && latestActionAt ? formatRelative(latestActionAt, now) : "—"}
      </p>
    </section>
  );
}
