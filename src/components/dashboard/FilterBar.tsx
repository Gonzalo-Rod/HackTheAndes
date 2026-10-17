"use client";

import { CAUSE_META, CAUSE_ORDER, STATUS_META, STATUS_ORDER } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { AlertCause, RoadStatus } from "@/contracts/road-alerts";
import { toggleValue, type AlertFilters } from "@/domain/road-alerts/filters";
import { plural } from "@/lib/format";

interface FilterBarProps {
  filters: AlertFilters;
  facets: { statuses: Record<RoadStatus, number>; causes: Record<AlertCause, number> };
  regions: { key: string; label: string; count: number }[];
  resultCount: number;
  totalCount: number;
  active: boolean;
  onChange: (filters: AlertFilters) => void;
  onClear: () => void;
}

export function FilterBar({ filters, facets, regions, resultCount, totalCount, active, onChange, onClear }: FilterBarProps) {
  const statuses = STATUS_ORDER.filter((s) => s !== "desconocido" || facets.statuses.desconocido > 0);
  const causes = CAUSE_ORDER.filter((c) => c !== "otro" || facets.causes.otro > 0);
  return (
    <div className="pr-filterbar" role="search" aria-label="Filtros de alertas">
      <label className="pr-search">
        <Icon name="search" size={14} />
        <span className="pr-sr-only">Buscar alertas</span>
        <input
          type="search"
          placeholder="Buscar vía, distrito, código…"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
        />
      </label>

      <div className="pr-chipgroup" role="group" aria-label="Estado de la vía">
        {statuses.map((status) => {
          const meta = STATUS_META[status];
          const pressed = filters.statuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              className="pr-chip"
              aria-pressed={pressed}
              onClick={() => onChange({ ...filters, statuses: toggleValue(filters.statuses, status) })}
            >
              <span className="pr-status-glyph" style={{ background: meta.color, color: meta.ink }}>
                <Icon name={status} size={10} strokeWidth={2.6} />
              </span>
              {meta.label}
              <span className="pr-chip__count">{facets.statuses[status]}</span>
            </button>
          );
        })}
      </div>

      <div className="pr-chipgroup pr-chipgroup--causes" role="group" aria-label="Motivo">
        {causes.map((cause) => (
          <button
            key={cause}
            type="button"
            className="pr-chip pr-chip--quiet"
            aria-pressed={filters.causes.includes(cause)}
            onClick={() => onChange({ ...filters, causes: toggleValue(filters.causes, cause) })}
            title={CAUSE_META[cause].label}
          >
            <Icon name={cause} size={13} />
            <span className="pr-chip__label">{CAUSE_META[cause].short}</span>
            <span className="pr-chip__count">{facets.causes[cause]}</span>
          </button>
        ))}
      </div>

      <label className="pr-select">
        <span className="pr-sr-only">Región</span>
        <select value={filters.regionKey ?? ""} onChange={(event) => onChange({ ...filters, regionKey: event.target.value || null })}>
          <option value="">Todas las regiones</option>
          {regions.map((region) => (
            <option key={region.key} value={region.key}>
              {region.label} ({region.count})
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={14} />
      </label>

      <div className="pr-filterbar__end">
        <span className="pr-filterbar__count" aria-live="polite">
          {active ? `${resultCount} de ${plural(totalCount, "alerta", "alertas")}` : plural(totalCount, "alerta vigente", "alertas vigentes")}
        </span>
        {active && (
          <button type="button" className="pr-btn pr-btn--link" onClick={onClear}>
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
