"use client";

import { Icon } from "@/components/icons";

export interface MapStateOverlayProps {
  loading: boolean;
  mapReady: boolean;
  mapError: string | null;
  dataError: string | null; // no data could be loaded at all
  refreshing: boolean;
  partialData?: boolean;
  onRetry: () => void;
}

/** Loading and error states over the map. The map never appears blank without a reason. */
export function MapStateOverlay({
  loading,
  mapReady,
  mapError,
  dataError,
  refreshing,
  partialData = false,
  onRetry,
}: MapStateOverlayProps) {
  if (mapError) {
    return (
      <div className="pr-overlay" role="alert">
        <div className="pr-overlay__card">
          <Icon name="info" size={20} />
          <h2>No se pudo mostrar el mapa</h2>
          <p>{mapError} Las alertas siguen disponibles en la lista de eventos.</p>
          <button type="button" className="pr-btn" onClick={() => window.location.reload()}>
            Recargar la página
          </button>
        </div>
      </div>
    );
  }
  if (dataError && !partialData) {
    return (
      <div className="pr-overlay" role="alert">
        <div className="pr-overlay__card">
          <Icon name="info" size={20} />
          <h2>Fuente no disponible</h2>
          <p>No se pudo obtener las alertas de SUTRAN. {dataError}</p>
          <button type="button" className="pr-btn pr-btn--accent" onClick={onRetry} disabled={refreshing}>
            <span className={refreshing ? "pr-spin" : undefined}>
              <Icon name="refresh" size={13} />
            </span>
            Reintentar
          </button>
        </div>
      </div>
    );
  }
  // Stale or cached sources are reported by the header data-status chip, not over the map.
  if (!loading && mapReady) return null;
  return (
    <div className="pr-loading" role="status">
      <span className="pr-loading__spinner" aria-hidden="true" />
      {loading ? "Consultando alertas de SUTRAN…" : "Cargando el mapa…"}
    </div>
  );
}
