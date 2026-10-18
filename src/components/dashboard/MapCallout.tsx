"use client";

import { CAUSE_META, STATUS_META, sutranAlertUrl } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { RoadAlert } from "@/contracts/road-alerts";
import { formatCalendarDate, formatRelative } from "@/lib/format";

interface MapCalloutProps {
  alert: RoadAlert;
  now: number | null;
  orbiting: boolean;
  is3d: boolean;
  onOpenDetail: () => void;
  onToggleOrbit: () => void;
  onClose: () => void;
}

/** Dark card for the selected alert, anchored to the bottom of the map. */
export function MapCallout({ alert, now, orbiting, is3d, onOpenDetail, onToggleOrbit, onClose }: MapCalloutProps) {
  const status = STATUS_META[alert.roadStatus];
  const isCommunity = alert.id.startsWith("community:");
  return (
    <section className="pr-callout" aria-label="Alerta seleccionada">
      <header className="pr-callout__head">
        <span className="pr-callout__badge" style={{ background: status.color, color: status.ink }}>
          <Icon name={alert.roadStatus} size={11} strokeWidth={2.6} />
          {status.label}
        </span>
        <span className="pr-callout__cause">
          <Icon name={alert.cause} size={13} />
          {CAUSE_META[alert.cause].short}
        </span>
        <span className="pr-callout__code">{alert.code}</span>
        <button type="button" className="pr-callout__close" onClick={onClose} aria-label="Cerrar alerta">
          <Icon name="close" size={14} />
        </button>
      </header>
      <p className="pr-callout__title">{alert.title}</p>
      <dl className="pr-callout__figures">
        <div>
          <dt>Vía</dt>
          <dd>{alert.roadCode || "—"}</dd>
        </div>
        <div>
          <dt>Kilómetro</dt>
          <dd>{alert.km !== null ? alert.km.toLocaleString("es-PE") : "—"}</dd>
        </div>
        <div>
          <dt>{isCommunity ? "Reporte" : "Evento"}</dt>
          <dd>{formatCalendarDate(alert.eventDate).replace(/ \d{4}$/, "")}</dd>
        </div>
        <div>
          <dt>Actualizado</dt>
          <dd>{now ? formatRelative(alert.lastActionAt, now).replace("hace ", "") : "—"}</dd>
        </div>
      </dl>
      <footer className="pr-callout__actions">
        <button type="button" className="pr-btn pr-btn--accent" onClick={onOpenDetail}>
          Ver detalle
        </button>
        {is3d && (
          <button type="button" className="pr-btn pr-btn--dark" onClick={onToggleOrbit} aria-pressed={orbiting}>
            <Icon name="orbit" size={13} />
            {orbiting ? "Detener" : "Orbitar"}
          </button>
        )}
        {!isCommunity && (
          <a className="pr-btn pr-btn--dark" href={sutranAlertUrl(alert.id)} target="_blank" rel="noopener noreferrer">
            SUTRAN
            <Icon name="external" size={12} />
          </a>
        )}
      </footer>
    </section>
  );
}
