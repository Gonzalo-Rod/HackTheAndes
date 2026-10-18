"use client";

import { CAUSE_META, historyTypeLabel, STATUS_META, sutranAlertUrl } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { AlertDetailResponse, RoadAlert } from "@/contracts/road-alerts";
import type { RainSample } from "@/contracts/weather";
import { classifyRain, rainPeakMm } from "@/domain/weather/rain";
import { hoursSinceAction, isStaleAlert, STALE_ALERT_AFTER_HOURS } from "@/domain/road-alerts/staleness";
import { formatCalendarDate, formatDateTime, formatElevation, formatKm, formatRelative } from "@/lib/format";

import type { useAlertDetail } from "@/hooks/use-alert-detail";

export interface CorridorContext {
  km: number;
  elevationM: number;
  nearestPlace: string;
  deltaKm: number;
  /** Nearest rain sample on the corridor, when the forecast is loaded. */
  rain: RainSample | null;
}

interface AlertDetailProps {
  alert: RoadAlert;
  detail: ReturnType<typeof useAlertDetail>;
  corridorContext: CorridorContext | null;
  /** Alerts currently vigente on the same road code. */
  roadAlertCount: number;
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
  if (!data.history.length) return <p className="pr-note">No hay cambios registrados para este incidente.</p>;
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
          <a
            key={`${href}-${index}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="pr-evidence__item"
            title={item.name ?? undefined}
          >
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
  const isCommunity = alert.id.startsWith("community:");
  return (
    <article className="pr-detail" aria-labelledby="detail-title">
      <div className="pr-detail__nav">
        <button type="button" className="pr-btn pr-btn--ghost pr-detail__back-btn" onClick={onClose}>
          <Icon name="arrowLeft" size={13} />
          <span>Volver a la lista de avisos</span>
        </button>
      </div>

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

      {/* Answer 1: What happened */}
      {alert.currentSituation && (
        <div className="pr-detail__situation-block">
          <span className="pr-detail__subhead">Situación reportada:</span>
          <blockquote className="pr-situation">{alert.currentSituation}</blockquote>
        </div>
      )}
      {alert.description && alert.description !== alert.title && <p className="pr-detail__desc">{alert.description}</p>}

      {/* Answer 2: Where */}
      <dl className="pr-figures">
        <div>
          <dt>Vía</dt>
          <dd>{alert.roadCode || "—"}</dd>
        </div>
        <div>
          <dt>Kilómetro</dt>
          <dd>{alert.kmText || "—"}</dd>
        </div>
        <div>
          <dt>Sentido</dt>
          <dd>{alert.direction || "Ambos sentidos"}</dd>
        </div>
        <div>
          <dt>Vigente hasta</dt>
          <dd>{formatCalendarDate(alert.validUntil)}</dd>
        </div>
      </dl>

      <p className="pr-detail__inline-note">
        <strong>Tramo afectado en mapa:</strong> Resaltado de ±1,2 km alrededor del incidente para advertencia operativa.
      </p>

      {corridorContext && (
        <div className="pr-corridor-ctx">
          <Icon name="mountain" size={14} />
          <span>
            En el eje PE-22: {formatKm(corridorContext.km)} · {formatElevation(corridorContext.elevationM)} ·{" "}
            {Math.abs(corridorContext.deltaKm) < 1
              ? `en ${corridorContext.nearestPlace}`
              : `a ${Math.abs(corridorContext.deltaKm).toFixed(1)} km de ${corridorContext.nearestPlace}`}
          </span>
        </div>
      )}

      {now && isStaleAlert(alert, now) && (
        <div className="pr-stale-note" role="note">
          <Icon name="restringido" size={14} />
          <span>
            Sin novedades de la fuente hace {Math.round(hoursSinceAction(alert, now) ?? 0)} h (umbral: {STALE_ALERT_AFTER_HOURS} h). La
            alerta sigue vigente, pero el estado podría haber cambiado; confirma antes de movilizar unidades.
          </span>
        </div>
      )}

      {corridorContext?.rain && (
        <p className="pr-note">
          Lluvia cerca de este km: {classifyRain(rainPeakMm(corridorContext.rain)).label.toLowerCase()} (últimas 24 h{" "}
          {corridorContext.rain.pastMm.toLocaleString("es-PE")} mm · próximas 24 h {corridorContext.rain.nextMm.toLocaleString("es-PE")}{" "}
          mm). Pronóstico meteorológico de Open-Meteo.
        </p>
      )}

      {/* Consolidated source card (Priority 2 Item 6) */}
      <section className="pr-source-card" aria-label="Ficha de origen y verificación">
        <h3 className="pr-source-card__title">
          <Icon name="source" size={14} />
          {isCommunity ? "Ficha de origen · reporte comunitario sin verificar" : "Ficha de origen y verificación oficial"}
        </h3>
        <dl className="pr-source-card__dl">
          <div className="pr-source-card__row">
            <dt>Entidad emisora:</dt>
            <dd>{alert.source || (isCommunity ? "Reporte comunitario" : "SUTRAN (Superintendencia de Transporte Terrestre / MTC)")}</dd>
          </div>
          <div className="pr-source-card__row">
            <dt>Emisión / Registro:</dt>
            <dd>{formatDateTime(alert.eventDate)}</dd>
          </div>
          <div className="pr-source-card__row">
            <dt>Periodo de validez:</dt>
            <dd>
              Desde {formatCalendarDate(alert.eventDate)} hasta {formatCalendarDate(alert.validUntil)}
            </dd>
          </div>
          <div className="pr-source-card__row">
            <dt>{isCommunity ? "Último reporte:" : "Última verificación:"}</dt>
            <dd>
              {now ? formatRelative(alert.lastActionAt, now) : "Reciente"}
              <span className="pr-muted"> ({formatDateTime(alert.lastActionAt)})</span>
            </dd>
          </div>
          {alert.administrator && (
            <div className="pr-source-card__row">
              <dt>Concesionaria:</dt>
              <dd>{alert.administrator}</dd>
            </div>
          )}
        </dl>
      </section>

      <dl className="pr-kv">
        <Row label="Ubicación">{[alert.district, alert.province, alert.region].filter(Boolean).join(", ")}</Row>
        <Row label="Nombre de la vía">{alert.roadName || "—"}</Row>
        {alert.sourceUrl && (
          <Row label="Fuente">
            <a href={alert.sourceUrl} target="_blank" rel="noopener noreferrer">
              ver fuente
            </a>
          </Row>
        )}
        {isCommunity && <Row label="Reportantes independientes">{alert.reportCount}</Row>}
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
            <button type="button" className="pr-btn pr-btn--link" onClick={onRetryDetail}>
              Reintentar
            </button>
          </p>
        )}
        {detail.status === "ready" && (
          <>
            <History data={detail.data} />
            <Evidence data={detail.data} />
          </>
        )}
      </section>

      <div className="pr-help">
        <span>Emergencias en carretera (MTC)</span>
        <span>
          <a href="tel:981232298">981 232 298</a> · <a href="tel:981232505">981 232 505</a>
        </span>
      </div>

      <footer className="pr-detail__actions">
        <button type="button" className="pr-btn" onClick={onCenter}>
          <Icon name="crosshair" size={13} />
          Centrar en el mapa
        </button>
        {!isCommunity && (
          <a className="pr-btn" href={sutranAlertUrl(alert.id)} target="_blank" rel="noopener noreferrer">
            Ver en SUTRAN
            <Icon name="external" size={12} />
          </a>
        )}
      </footer>
    </article>
  );
}
