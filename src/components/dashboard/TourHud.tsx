"use client";

import { Icon } from "@/components/icons";
import type { CorridorData } from "@/contracts/corridor";
import { elevationAtKm, nearestPlace } from "@/domain/road-alerts/corridor-placement";
import { formatElevation } from "@/lib/format";

/** Readout shown while the camera travels along PE-22. */
export function TourHud({ corridor, km, onStop }: { corridor: CorridorData; km: number; onStop: () => void }) {
  const near = nearestPlace(corridor.places, km);
  const progress = Math.min(100, (km / corridor.kmTotal) * 100);
  const nearLabel = near
    ? Math.abs(near.deltaKm) < 1.5
      ? near.place.name
      : `${Math.abs(near.deltaKm).toFixed(0)} km ${near.deltaKm < 0 ? "antes de" : "después de"} ${near.place.name}`
    : "";
  return (
    <div className="pr-tour" role="status" aria-live="off">
      <div className="pr-tour__row">
        <span className="pr-tour__eyebrow">Recorrido · Carretera Central</span>
        <button type="button" className="pr-btn pr-btn--dark pr-btn--xs" onClick={onStop}>
          <Icon name="pause" size={11} />
          Detener
        </button>
      </div>
      <div className="pr-tour__figures">
        <span>
          <strong>km {Math.round(km)}</strong>
        </span>
        <span>{formatElevation(elevationAtKm(corridor.profile, km))}</span>
        <span className="pr-tour__place">{nearLabel}</span>
      </div>
      <div className="pr-tour__bar" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
