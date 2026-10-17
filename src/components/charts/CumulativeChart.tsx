"use client";

import { useState } from "react";

import type { CumulativePoint, TimelineWindow } from "@/domain/road-alerts/timeline";
import { useElementSize } from "@/hooks/use-element-size";
import { formatShortDate } from "@/lib/format";
import { DAY_MS } from "@/lib/time";

import { ChartCard, ChartTooltip } from "./ChartCard";

const PAD = { top: 8, right: 10, bottom: 18, left: 26 };
const SERIES_COLOR = "#2a78d6"; // categorical slot 1 (single series)

interface CumulativeChartProps {
  points: CumulativePoint[];
  window: TimelineWindow;
  cursorMs: number | null;
  onPickDay: (dayEndMs: number) => void;
}

export function CumulativeChart({ points, window, cursorMs, onPickDay }: CumulativeChartProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const width = size.width;
  const height = size.height;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = Math.max(0, height - PAD.top - PAD.bottom);
  const maxY = Math.max(1, ...points.map((p) => p.total));
  const span = Math.max(1, window.endMs - window.startMs);
  const x = (ms: number) => PAD.left + ((ms - window.startMs) / span) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / maxY) * plotH;

  // Step path: the count changes at each day boundary.
  let line = "";
  points.forEach((p, i) => {
    const x0 = x(Math.max(window.startMs, p.dayStartMs));
    const x1 = x(Math.min(window.endMs, p.dayStartMs + DAY_MS));
    line += `${i === 0 ? "M" : "L"}${x0},${y(p.total)}L${x1},${y(p.total)}`;
  });
  const area = points.length ? `${line}L${x(window.endMs)},${y(0)}L${x(window.startMs)},${y(0)}Z` : "";
  const ticks = maxY <= 4 ? Array.from({ length: maxY + 1 }, (_, i) => i) : [0, Math.round(maxY / 2), maxY];
  const hovered = hover !== null ? points[hover] : null;
  const cursorX = cursorMs !== null ? x(cursorMs) : null;

  const indexAt = (clientX: number, rect: DOMRect) => {
    const ms = window.startMs + ((clientX - rect.left - PAD.left) / plotW) * span;
    return Math.max(0, Math.min(points.length - 1, Math.floor((ms - (points[0]?.dayStartMs ?? 0)) / DAY_MS)));
  };

  const table = (
    <table>
      <thead>
        <tr>
          <th>Día</th>
          <th>Nuevas</th>
          <th>Acumuladas</th>
        </tr>
      </thead>
      <tbody>
        {points
          .filter((p) => p.added > 0)
          .map((p) => (
            <tr key={p.dayStartMs}>
              <td>{formatShortDate(p.dayStartMs + DAY_MS / 2)}</td>
              <td>{p.added}</td>
              <td>{p.total}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard title="Alertas vigentes acumuladas" subtitle="Según fecha del evento" table={table}>
      <div ref={ref} className="pr-chart__plot">
        {width > 0 && points.length > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Acumulado de alertas vigentes: ${points[points.length - 1].total} al final del periodo`}
            onPointerMove={(event) => setHover(indexAt(event.clientX, event.currentTarget.getBoundingClientRect()))}
            onPointerLeave={() => setHover(null)}
            onClick={(event) => {
              const point = points[indexAt(event.clientX, event.currentTarget.getBoundingClientRect())];
              if (point) onPickDay(point.dayStartMs + DAY_MS - 1);
            }}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="pr-grid" />
                <text x={PAD.left - 6} y={y(t)} className="pr-axis" textAnchor="end" dominantBaseline="middle">
                  {t}
                </text>
              </g>
            ))}
            <path d={area} fill={SERIES_COLOR} opacity={0.1} />
            <path d={line} fill="none" stroke={SERIES_COLOR} strokeWidth={2} strokeLinejoin="round" />
            <text x={PAD.left} y={height - 4} className="pr-axis">
              {formatShortDate(window.startMs + DAY_MS / 2)}
            </text>
            <text x={width - PAD.right} y={height - 4} className="pr-axis" textAnchor="end">
              Hoy
            </text>
            {cursorX !== null && <line x1={cursorX} x2={cursorX} y1={PAD.top} y2={PAD.top + plotH} className="pr-cursor-line" />}
            {hovered && (
              <g>
                <line
                  x1={x(hovered.dayStartMs + DAY_MS / 2)}
                  x2={x(hovered.dayStartMs + DAY_MS / 2)}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  className="pr-crosshair"
                />
                <circle
                  cx={x(hovered.dayStartMs + DAY_MS / 2)}
                  cy={y(hovered.total)}
                  r={4}
                  fill={SERIES_COLOR}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>
        )}
        {hovered && (
          <ChartTooltip x={x(hovered.dayStartMs + DAY_MS / 2)} y={y(hovered.total)} width={width}>
            <span className="pr-tooltip__main">
              <strong>{hovered.total}</strong> alertas vigentes
            </span>
            <span>
              {formatShortDate(hovered.dayStartMs + DAY_MS / 2)}
              {hovered.added ? ` · +${hovered.added} ese día` : ""}
            </span>
          </ChartTooltip>
        )}
      </div>
    </ChartCard>
  );
}
