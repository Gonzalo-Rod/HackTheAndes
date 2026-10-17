"use client";

import { CAUSE_META, historyTypeLabel, STATUS_META, sutranAlertUrl } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { AlertDetailResponse, RoadAlert } from "@/contracts/road-alerts";
import { formatCalendarDate, formatDateTime, formatElevation, formatKm, formatRelative } from "@/lib/format";

import type { useAlertDetail } from "@/hooks/use-alert-detail";

export interface CorridorContext {
  km: number;
  elevationM: number;
  nearestPlace: string;
  deltaKm: number;
}

interface AlertDetailProps {
  alert: RoadAlert;
  detail: ReturnType<typeof useAlertDetail>;
  corridorContext: CorridorContext | null;
  now: number | null;
  onRetryDetail: () => void;
  onCenter: () => void;
  onClose: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pr-kv__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function History({ data }: { data: AlertDetailResponse }) {
  if (data.history === null) return <p className="pr-note">El historial no está disponible en este momento.</p>;
  if (!data.history.length) return <p className="pr-note">SUTRAN no registra cambios para esta alerta.</p>;
  return (
    <ol className="pr-history">
      {data.history.map((entry, index) => (
        <li key={`${entry.date}-${index}`}>
          <span className="pr-history__dot" style={entry.newStatus ? { background: STATUS_META[entry.newStatus].color } : undefined} />
          <span className="pr-history__what">
            {historyTypeLabel(entry.type)}
            {entry.newStatus && ` → ${STATUS_META[entry.newStatus].label}`}
          </span>
          <span className="pr-history__when">{formatDateTime(entry.date)}</span>
        </li>
      ))}
    </ol>
  );
}

function Evidence({ data }: { data: AlertDetailResponse }) {
  if (!data.evidence.length) return null;
  return (
    <div className="pr-evidence">
      {data.evidence.map((item, index) => {
        const href = item.url ?? item.posterUrl ?? "#";
        const preview = item.kind === "foto" ? item.url : item.posterUrl;
        return (
          <a key={`${href}-${index}`} href={href} target="_blank" rel="noopener noreferrer" className="pr-evidence__item" title={item.name ?? undefined}>
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- external SUTRAN media, not optimizable by next/image without a domain allowlist
              <img src={preview} alt={item.name ?? (item.kind === "foto" ? "Foto de la alerta" : "Video de la alerta")} loading="lazy" />
            ) : (
              <Icon name="image" size={20} />
            )}
            <span>{item.kind === "foto" ? "Foto" : "Video"}</span>
          </a>
        );
      })}
    </div>
  );
}

export function AlertDetail({ alert, detail, corridorContext, now, onRetryDetail, onCenter, onClose }: AlertDetailProps) {
  const status = STATUS_META[alert.roadStatus];
  return (
    <article className="pr-detail" aria-labelledby="detail-title">
      <header className="pr-detail__head" style={{ borderColor: status.color }}>
        <div className="pr-detail__badges">
          <span className="pr-badge" style={{ background: status.color, color: status.ink }}>
            <Icon name={alert.roadStatus} size={11} strokeWidth={2.6} />
            {status.label}
          </span>
          <span className="pr-badge pr-badge--quiet">
            <Icon name={alert.cause} size={12} />
            {CAUSE_META[alert.cause].short}
            {detail.status === "ready" && detail.data.subcause ? ` · ${detail.data.subcause}` : ""}
          </span>
          <button type="button" className="pr-icon-btn pr-icon-btn--sm pr-detail__close" onClick={onClose} aria-label="Cerrar detalle">
            <Icon name="close" size={14} />
          </button>
        </div>
        <h2 id="detail-title" className="pr-detail__title">
          {alert.title}
        </h2>
        <p className="pr-detail__code">
          {alert.code} · {status.description}
        </p>
      </header>

      <dl className="pr-figures">
        <div><dt>Vía</dt><dd>{alert.roadCode || "—"}</dd></div>
        <div><dt>Kilómetro</dt><dd>{alert.kmText || "—"}</dd></div>
        <div><dt>Sentido</dt><dd>{alert.direction || "—"}</dd></div>
        <div><dt>Fecha del evento</dt><dd>{formatCalendarDate(alert.eventDate)}</dd></div>
        <div><dt>Vigente hasta</dt><dd>{formatCalendarDate(alert.validUntil)}</dd></div>
        <div><dt>Última acción</dt><dd>{now ? formatRelative(alert.lastActionAt, now) : "—"}</dd></div>
      </dl>

      {alert.currentSituation && <blockquote className="pr-situation">{alert.currentSituation}</blockquote>}
      {alert.description && alert.description !== alert.title && <p className="pr-detail__desc">{alert.description}</p>}

      {corridorContext && (
        <div className="pr-corridor-ctx">
          <Icon name="mountain" size={14} />
          <span>
            En el eje PE-22: {formatKm(corridorContext.km)} (geometría MTC) · {formatElevation(corridorContext.elevationM)} ·{" "}
            {Math.abs(corridorContext.deltaKm) < 1 ? `en ${corridorContext.nearestPlace}` : `a ${Math.abs(corridorContext.deltaKm).toFixed(1)} km de ${corridorContext.nearestPlace}`}
          </span>
        </div>
      )}

      <dl className="pr-kv">
        <Row label="Ubicación">{[alert.district, alert.province, alert.region].filter(Boolean).join(", ")}</Row>
        <Row label="Nombre de la vía">{alert.roadName || "—"}</Row>
        <Row label="Administrador">{alert.administrator || "—"}</Row>
        <Row label="Fuente">
          {alert.source || "—"}
          {alert.sourceUrl && (
            <>
              {" · "}
              <a href={alert.sourceUrl} target="_blank" rel="noopener noreferrer">ver fuente</a>
            </>
          )}
        </Row>
        {alert.pnpActions && <Row label="Acciones PNP">{alert.pnpActions}</Row>}
        {(alert.detainedPassengers > 0 || alert.detainedGoods > 0) && (
          <Row label="Detenidos">{`${alert.detainedPassengers} pasajeros · ${alert.detainedGoods} mercancías`}</Row>
        )}
        {detail.status === "ready" && detail.data.tags.length > 0 && <Row label="Etiquetas">{detail.data.tags.join(", ")}</Row>}
      </dl>

      <section className="pr-detail__section" aria-label="Historial de la alerta">
        <h3>Historial</h3>
        {detail.status === "loading" && <p className="pr-note pr-shimmer-text">Cargando historial…</p>}
        {detail.status === "error" && (
          <p className="pr-note pr-note--warn">
            No se pudo cargar el historial: {detail.message}{" "}
            <button type="button" className="pr-btn pr-btn--link" onClick={onRetryDetail}>Reintentar</button>
          </p>
        )}
        {detail.status === "ready" && (
          <>
            <History data={detail.data} />
            <Evidence data={detail.data} />
          </>
        )}
      </section>

      <footer className="pr-detail__actions">
        <button type="button" className="pr-btn" onClick={onCenter}>
          <Icon name="crosshair" size={13} />
          Centrar en el mapa
        </button>
        <a className="pr-btn" href={sutranAlertUrl(alert.id)} target="_blank" rel="noopener noreferrer">
          Ver en SUTRAN
          <Icon name="external" size={12} />
        </a>
      </footer>
    </article>
  );
}
