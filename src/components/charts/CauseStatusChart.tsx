"use client";

import { useState } from "react";

import { CAUSE_META, STATUS_META, STATUS_ORDER } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { AlertCause, RoadStatus } from "@/contracts/road-alerts";

import { ChartCard } from "./ChartCard";

type Row = { cause: AlertCause; byStatus: Record<RoadStatus, number>; total: number };

interface CauseStatusChartProps {
  rows: Row[];
  activeCauses: readonly AlertCause[];
  onToggleCause: (cause: AlertCause) => void;
}

const BAR_HEIGHT_PX = 14;
/** Share of the track the longest bar may use, leaving room for the value label at its tip. */
const BAR_MAX_SHARE_PCT = 82;
const LEGEND_STATUSES: RoadStatus[] = ["interrumpido", "restringido", "normal"];

/** Stacked bars: alerts per cause split by road status (status colors, 2px surface gaps). */
export function CauseStatusChart({ rows, activeCauses, onToggleCause }: CauseStatusChartProps) {
  const [hover, setHover] = useState<{ cause: AlertCause; status: RoadStatus } | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.total));

  const legend = LEGEND_STATUSES.map((status) => (
    <span key={status} className="pr-chart__key">
      <span className="pr-chart__swatch" style={{ background: STATUS_META[status].color }} />
      {STATUS_META[status].label}
    </span>
  ));

  const table = (
    <table>
      <thead>
        <tr>
          <th>Motivo</th>
          {LEGEND_STATUSES.map((s) => (
            <th key={s}>{STATUS_META[s].label}</th>
          ))}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.cause}>
            <td>{CAUSE_META[r.cause].short}</td>
            {LEGEND_STATUSES.map((s) => (
              <td key={s}>{r.byStatus[s]}</td>
            ))}
            <td>{r.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard title="Motivo y estado de la vía" subtitle="Clic en una fila para filtrar" legend={legend} table={table}>
      {rows.length === 0 ? (
        <p className="pr-chart__empty">Sin alertas con los filtros actuales.</p>
      ) : (
        <ul className="pr-bars">
          {rows.map((row) => {
            const active = activeCauses.includes(row.cause);
            return (
              <li key={row.cause}>
                <button
                  type="button"
                  className={`pr-bars__row${active ? " is-active" : ""}`}
                  onClick={() => onToggleCause(row.cause)}
                  aria-pressed={active}
                  aria-label={`${CAUSE_META[row.cause].label}: ${row.total} alertas. ${STATUS_ORDER.filter((s) => row.byStatus[s] > 0)
                    .map((s) => `${row.byStatus[s]} ${STATUS_META[s].label.toLowerCase()}`)
                    .join(", ")}`}
                >
                  <span className="pr-bars__label">
                    <Icon name={row.cause} size={12} />
                    {CAUSE_META[row.cause].short}
                  </span>
                  <span className="pr-bars__track" style={{ height: BAR_HEIGHT_PX }}>
                    {STATUS_ORDER.filter((s) => row.byStatus[s] > 0).map((status) => {
                      const isHover = hover?.cause === row.cause && hover.status === status;
                      return (
                        <span
                          key={status}
                          className={`pr-bars__seg${isHover ? " is-hover" : ""}`}
                          style={{ width: `${(row.byStatus[status] / max) * BAR_MAX_SHARE_PCT}%`, background: STATUS_META[status].color }}
                          onPointerEnter={() => setHover({ cause: row.cause, status })}
                          onPointerLeave={() => setHover(null)}
                          title={`${STATUS_META[status].label}: ${row.byStatus[status]}`}
                        />
                      );
                    })}
                    <span className="pr-bars__value">{row.total}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}
