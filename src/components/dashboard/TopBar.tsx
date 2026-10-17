"use client";

import { Icon, LogoMark } from "@/components/icons";
import type { AlertsMeta } from "@/contracts/road-alerts";
import { formatDateTime, formatRelative, formatTime, formatToday } from "@/lib/format";

import type { Scope } from "./types";

/** Data older than this is flagged in the freshness pill (twice the polling interval plus margin). */
const STALE_AFTER_MS = 5 * 60_000;

interface TopBarProps {
  communityStatus: string;
  scope: Scope;
  counts: { pais: number; pe22: number };
  meta: AlertsMeta | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  now: number | null;
  onScopeChange: (scope: Scope) => void;
  onRefresh: () => void;
  onOpenSources: () => void;
}

function Freshness({
  meta,
  loading,
  refreshing,
  error,
  now,
  onRefresh,
}: Pick<TopBarProps, "meta" | "loading" | "refreshing" | "error" | "now" | "onRefresh">) {
  const ageMs = meta && now ? now - Date.parse(meta.fetchedAt) : 0;
  const tone = error || meta?.stale ? "warn" : meta && ageMs > STALE_AFTER_MS ? "warn" : meta ? "ok" : "idle";
  let label = "Consultando SUTRAN…";
  if (meta && now) {
    const age = formatRelative(meta.fetchedAt, now);
    label =
      meta.fallback === "snapshot" ? `Instantánea SUTRAN · ${age}` : meta.stale ? `Datos en caché · ${age}` : `SUTRAN · consultado ${age}`;
  } else if (!loading && error) {
    label = "SUTRAN no disponible";
  }
  const title =
    meta?.fallback === "snapshot"
      ? `SUTRAN no responde. Instantánea guardada el ${formatDateTime(meta.fetchedAt)}; se reintenta cada 2 min.`
      : meta
        ? `Consulta a SUTRAN: ${formatTime(Date.parse(meta.fetchedAt))}. Última acción publicada por SUTRAN: ${meta.latestActionAt ? formatTime(Date.parse(meta.latestActionAt)) : "—"}. Se actualiza cada 2 min.`
        : undefined;
  return (
    <div className={`pr-fresh pr-fresh--${tone}`} title={title}>
      <span className="pr-fresh__dot" aria-hidden="true" />
      <span className="pr-fresh__label" aria-live="polite">
        {label}
      </span>
      <button
        type="button"
        className="pr-icon-btn pr-icon-btn--sm"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Actualizar datos de SUTRAN"
        title="Actualizar"
      >
        <span className={refreshing ? "pr-spin" : undefined}>
          <Icon name="refresh" size={14} />
        </span>
      </button>
    </div>
  );
}

export function TopBar(props: TopBarProps) {
  const { scope, counts, now, onScopeChange, onOpenSources } = props;
  return (
    <header className="pr-topbar">
      <div className="pr-brand">
        <LogoMark />
        <div className="pr-brand__text">
          <span className="pr-brand__name">PeruRoad Climate</span>
          <span className="pr-brand__sub">Estado vial y territorio</span>
        </div>
      </div>
      <div className="pr-topbar__sep" aria-hidden="true" />
      <nav className="pr-segmented pr-scope" aria-label="Ámbito del mapa">
        <button type="button" aria-pressed={scope === "pais"} className="pr-segmented__item" onClick={() => onScopeChange("pais")}>
          <Icon name="globe" size={14} />
          <span>Perú</span>
          <span className="pr-count">{counts.pais}</span>
        </button>
        <button type="button" aria-pressed={scope === "pe22"} className="pr-segmented__item" onClick={() => onScopeChange("pe22")}>
          <Icon name="route" size={14} />
          <span>
            Carretera Central <span className="pr-muted pr-hide-sm">PE-22</span>
          </span>
          <span className="pr-count">{counts.pe22}</span>
        </button>
      </nav>
      <div className="pr-topbar__spacer" />
      <span className="pr-topbar__date pr-hide-md">{now ? formatToday(now) : " "}</span>
      <a className="pr-btn pr-btn--ghost" href="/impacto">
        Impacto
      </a>
      <a className="pr-btn pr-btn--ghost" href="/empresa">
        Empresas
      </a>
      <span className="pr-hide-md" role="status">
        {props.communityStatus}
      </span>
      <Freshness {...props} />
      <button type="button" className="pr-btn pr-btn--ghost pr-hide-sm" onClick={onOpenSources}>
        <Icon name="source" size={14} />
        Fuentes
      </button>
    </header>
  );
}
