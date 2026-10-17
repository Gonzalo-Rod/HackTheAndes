"use client";

import { useState, type ReactNode } from "react";

import { Icon } from "@/components/icons";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
}

/** Chart container with a chart/table toggle, so every value is reachable without hovering. */
export function ChartCard({ title, subtitle, legend, table, children }: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="pr-chart" aria-label={title}>
      <header className="pr-chart__head">
        <div className="pr-chart__titles">
          <h3>{title}</h3>
          {subtitle && <span className="pr-chart__sub">{subtitle}</span>}
        </div>
        {legend && !showTable && <div className="pr-chart__legend">{legend}</div>}
        <button
          type="button"
          className="pr-icon-btn pr-icon-btn--sm"
          onClick={() => setShowTable(!showTable)}
          aria-pressed={showTable}
          aria-label={showTable ? `Ver gráfico: ${title}` : `Ver tabla: ${title}`}
          title={showTable ? "Ver gráfico" : "Ver tabla"}
        >
          <Icon name={showTable ? "chart" : "table"} size={14} />
        </button>
      </header>
      <div className="pr-chart__body">{showTable ? <div className="pr-chart__table">{table}</div> : children}</div>
    </section>
  );
}

export function ChartTooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  // Keep the tooltip inside the plot: flip to the left of the pointer near the right edge.
  const flip = x > width - 150;
  return (
    <div
      className="pr-tooltip"
      style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: Math.max(0, y - 8) }}
      role="status"
    >
      {children}
    </div>
  );
}
