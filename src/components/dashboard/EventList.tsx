"use client";

import { CAUSE_META, STATUS_META } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { RoadAlert } from "@/contracts/road-alerts";
import { isStaleAlert, STALE_ALERT_AFTER_HOURS } from "@/domain/road-alerts/staleness";
import { formatListTime } from "@/lib/format";

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
  return (
    <section className="pr-events" aria-labelledby="events-title">
      <header className="pr-events__head">
        <h2 id="events-title" className="pr-dock-title">
          Eventos reportados
        </h2>
        <span className="pr-count pr-count--strong">{alerts.length}</span>
        <span className="pr-events__hint">Última actualización</span>
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
          <p>{emptyReason === "filters" ? "Ninguna alerta coincide con los filtros." : "No hay incidentes registrados en este ámbito."}</p>
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
                  className={`pr-event${selected ? " is-selected" : ""}${alert.id === hoveredId ? " is-hovered" : ""}${hiddenIds.has(alert.id) ? " is-future" : ""}`}
                  style={{ ["--accent" as string]: status.color }}
                  onClick={() => onSelect(alert.id)}
                  onMouseEnter={() => onHover(alert.id)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(alert.id)}
                  onBlur={() => onHover(null)}
                  aria-current={selected ? "true" : undefined}
                >
                  <span className="pr-event__icon" style={{ background: status.color, color: status.ink }}>
                    <Icon name={alert.cause} size={13} strokeWidth={2.2} />
                  </span>
                  <span className="pr-event__text">
                    <span className="pr-event__title">
                      {alert.roadCode} {alert.kmText ? `· ${alert.kmText.replace(/^km/i, "km")}` : ""}
                    </span>
                    <span className="pr-event__meta">
                      {status.label} · {CAUSE_META[alert.cause].short} · {alert.district || alert.region}
                      {now && isStaleAlert(alert, now) && (
                        <>
                          {" "}
                          <span className="pr-stale" title={`Sin novedades de la fuente hace más de ${STALE_ALERT_AFTER_HOURS} h`}>
                            Sin novedades
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="pr-event__time">{now ? formatListTime(alert.lastActionAt, now) : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
