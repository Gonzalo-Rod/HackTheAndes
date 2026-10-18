"use client";

import { STATUS_META } from "@/components/alert-meta";
import { HISTORY_CATEGORY_LABELS, HISTORY_STATUS_LABELS } from "@/components/road-history-meta";
import type { AlertRoadHistory } from "@/domain/road-history/nearby";
import { NEARBY_HISTORY_RADIUS_KM } from "@/domain/road-history/nearby";
import { formatCalendarDate, plural } from "@/lib/format";

interface RoadHistorySectionProps {
  history: AlertRoadHistory | null;
  loading: boolean;
  error: string | null;
}

const formatDistance = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

export function RoadHistorySection({ history, loading, error }: RoadHistorySectionProps) {
  return (
    <section className="pr-detail__section" aria-label="Antecedentes en la vía">
      <h3>Antecedentes en la vía</h3>
      {error && <p className="pr-note pr-note--warn">{error}</p>}
      {!error && loading && <p className="pr-note pr-shimmer-text">Cargando emergencias pasadas…</p>}
      {!error && !loading && history === null && (
        <p className="pr-note">La alerta no indica código de vía; no se pueden relacionar antecedentes.</p>
      )}
      {!error && !loading && history && (
        <>
          <p className="pr-note">
            {history.nearbyCount > 0
              ? `${plural(history.nearbyCount, "emergencia registrada", "emergencias registradas")} a menos de ${NEARBY_HISTORY_RADIUS_KM} km en la ${history.roadCode}`
              : `Sin emergencias registradas a menos de ${NEARBY_HISTORY_RADIUS_KM} km en la ${history.roadCode}; no significa que el tramo sea seguro`}
            {history.nearbyCount > 0 &&
              ` (${history.nearbyInterruptedCount} con vía interrumpida; ${history.nearbyRainfallCount} mencionan lluvias)`}
            . {plural(history.sameRoadCount, "registro", "registros")} en toda la vía.
          </p>
          {history.closest.length > 0 && (
            <ol className="pr-history">
              {history.closest.map(({ event, distanceKm }) => (
                <li key={event.id}>
                  <span className="pr-history__dot" style={{ background: STATUS_META[event.initialStatus].color }} />
                  <span className="pr-history__what">
                    {HISTORY_CATEGORY_LABELS[event.category]} · {HISTORY_STATUS_LABELS[event.initialStatus]} · a{" "}
                    {formatDistance(distanceKm)}
                  </span>
                  <span className="pr-history__when">{formatCalendarDate(event.date)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="pr-note pr-note--fine">Provías Nacional, ene–abr 2024 y 2025. Cobertura incompleta; no son alertas vigentes.</p>
        </>
      )}
    </section>
  );
}
