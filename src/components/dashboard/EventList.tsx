"use client";

import { CAUSE_META, STATUS_META } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { RoadAlert } from "@/contracts/road-alerts";
import { isStaleAlert, STALE_ALERT_AFTER_HOURS } from "@/domain/road-alerts/staleness";
import { formatCalendarDate, formatListTime, formatRelative } from "@/lib/format";

interface EventListProps {
  alerts: RoadAlert[];
  hiddenIds: ReadonlySet<string>;
  selectedId: string | null;
  hoveredId: string | null;
  now: number | null;
  loading: boolean;
  emptyReason: "filters" | "none" | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onClearFilters: () => void;
}

export function EventList({
  alerts,
  hiddenIds,
  selectedId,
  hoveredId,
  now,
  loading,
  emptyReason,
  onSelect,
  onHover,
  onClearFilters,
}: EventListProps) {
  const interruptedCount = alerts.filter((a) => a.roadStatus === "interrumpido").length;
  const restrictedCount = alerts.filter((a) => a.roadStatus === "restringido").length;
  const passableCount = alerts.filter((a) => a.roadStatus === "normal").length;

  return (
    <section className="pr-events" aria-labelledby="events-title">
      <header className="pr-events__head">
        <div className="pr-events__header-top">
          <h2 id="events-title" className="pr-dock-title">
            Avisos de ruta y operaciones
          </h2>
          <span className="pr-events__total-badge">{alerts.length}</span>
        </div>
        {/* Single compact operational status summary line */}
        <div className="pr-compact-summary" aria-label="Resumen de transitabilidad">
          <span className="pr-compact-summary__item">
            <strong>{alerts.length}</strong> activas
          </span>
          <span className="pr-compact-summary__sep">·</span>
          <span className="pr-compact-summary__item pr-compact-summary__item--interrupted">
            <span className="pr-summary-dot" style={{ background: STATUS_META.interrumpido.color }} />
            <strong>{interruptedCount}</strong> interrumpida{interruptedCount !== 1 ? "s" : ""}
          </span>
          <span className="pr-compact-summary__sep">·</span>
          <span className="pr-compact-summary__item pr-compact-summary__item--restricted">
            <span className="pr-summary-dot" style={{ background: STATUS_META.restringido.color }} />
            <strong>{restrictedCount}</strong> restringida{restrictedCount !== 1 ? "s" : ""}
          </span>
          <span className="pr-compact-summary__sep">·</span>
          <span className="pr-compact-summary__item pr-compact-summary__item--passable">
            <span className="pr-summary-dot" style={{ background: STATUS_META.normal.color }} />
            <strong>{passableCount}</strong> transitable{passableCount !== 1 ? "s" : ""}
          </span>
        </div>
      </header>

      {loading && (
        <ul className="pr-events__list" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="pr-skeleton-row" />
          ))}
        </ul>
      )}

      {!loading && emptyReason && (
        <div className="pr-empty">
          <Icon name={emptyReason === "filters" ? "search" : "check"} size={18} />
          <p>
            {emptyReason === "filters"
              ? "Ningún aviso coincide con los filtros seleccionados."
              : "SUTRAN no reporta alertas vigentes en este ámbito."}
          </p>
          {emptyReason === "filters" && (
            <button type="button" className="pr-btn pr-btn--link" onClick={onClearFilters}>
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {!loading && !emptyReason && (
        <ul className="pr-events__list">
          {alerts.map((alert) => {
            const status = STATUS_META[alert.roadStatus];
            const selected = alert.id === selectedId;
            return (
              <li key={alert.id}>
                <button
                  type="button"
                  className={`pr-event-card${selected ? " is-selected" : ""}${alert.id === hoveredId ? " is-hovered" : ""}${hiddenIds.has(alert.id) ? " is-future" : ""}`}
                  style={{ ["--status-color" as string]: status.color }}
                  onClick={() => onSelect(alert.id)}
                  onMouseEnter={() => onHover(alert.id)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(alert.id)}
                  onBlur={() => onHover(null)}
                  aria-current={selected ? "true" : undefined}
                >
                  {/* 1. Qué ocurrió: Tipo y título */}
                  <div className="pr-event-card__top">
                    <span className="pr-event-card__cause">
                      <Icon name={alert.cause} size={12} />
                      {CAUSE_META[alert.cause].short}
                    </span>
                    <span className="pr-event-card__status" style={{ background: status.color, color: status.ink }}>
                      <span className="pr-status-glyph pr-status-glyph--sm" style={{ background: "transparent", color: status.ink }}>
                        <Icon name={alert.roadStatus} size={9} strokeWidth={2.8} />
                      </span>
                      {status.label}
                    </span>
                  </div>

                  <h3 className="pr-event-card__title">{alert.title}</h3>

                  {/* 2. Dónde: Vía, kilómetro y localidad */}
                  <div className="pr-event-card__location">
                    <Icon name="route" size={12} />
                    <span className="pr-event-card__road">
                      {alert.roadCode} {alert.kmText ? `· ${alert.kmText.replace(/^km/i, "km")}` : ""}
                    </span>
                    <span className="pr-event-card__place">· {[alert.district, alert.region].filter(Boolean).join(", ")}</span>
                  </div>

                  {/* 3 & 4. Vigencia y Fuente */}
                  <div className="pr-event-card__footer">
                    <span className="pr-event-card__validity">Vigente hasta: {formatCalendarDate(alert.validUntil)}</span>
                    <span className="pr-event-card__source">
                      SUTRAN · {now ? formatRelative(alert.lastActionAt, now) : formatListTime(alert.lastActionAt, now ?? 0)}
                    </span>
                  </div>

                  {now && isStaleAlert(alert, now) && (
                    <div className="pr-event-card__stale" title={`Sin novedades de SUTRAN hace más de ${STALE_ALERT_AFTER_HOURS} h`}>
                      <Icon name="clock" size={11} />
                      <span>Sin novedades SUTRAN hace &gt;{STALE_ALERT_AFTER_HOURS}h</span>
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
