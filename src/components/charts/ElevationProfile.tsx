"use client";

import { useState } from "react";

import { STATUS_META } from "@/components/alert-meta";
import type { CorridorData } from "@/contracts/corridor";
import { elevationAtKm, nearestPlace, type CorridorAlert } from "@/domain/road-alerts/corridor-placement";
import { useElementSize } from "@/hooks/use-element-size";
import { formatElevation } from "@/lib/format";

import { ChartCard, ChartTooltip } from "./ChartCard";

const PAD = { top: 16, right: 12, bottom: 18, left: 38 };
const ELEVATION_CEILING_M = 5000; // Ticlio is ~4,800 m; a round ceiling keeps ticks clean
const MIN_PLACE_LABEL_GAP_PX = 58;
const TERRAIN_INK = "#6f685c";

interface ElevationProfileProps {
  corridor: CorridorData | null;
  placed: CorridorAlert[];
  hiddenIds: ReadonlySet<string>;
  activeKm: number | null; // tour position or external hover
  selectedId: string | null;
  onHoverKm: (km: number | null) => void;
  onPickKm: (km: number) => void;
  onSelectAlert: (id: string) => void;
}

export function ElevationProfile({ corridor, placed, hiddenIds, activeKm, selectedId, onHoverKm, onPickKm, onSelectAlert }: ElevationProfileProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [hoverKm, setHoverKm] = useState<number | null>(null);
  const { width, height } = size;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = Math.max(0, height - PAD.top - PAD.bottom);
  const kmTotal = corridor?.kmTotal ?? 1;
  const x = (km: number) => PAD.left + (km / kmTotal) * plotW;
  const y = (m: number) => PAD.top + plotH - (m / ELEVATION_CEILING_M) * plotH;

  const visiblePlaced = placed.filter((p) => !hiddenIds.has(p.alert.id));
  const table = (
    <table>
      <thead><tr><th>Lugar</th><th>km</th><th>Altitud</th></tr></thead>
      <tbody>
        {corridor?.places.map((p) => <tr key={p.name}><td>{p.name}</td><td>{Math.round(p.km)}</td><td>{formatElevation(p.elevationM)}</td></tr>)}
        {visiblePlaced.map((p) => (
          <tr key={p.alert.id}><td>Alerta {p.alert.code} ({STATUS_META[p.alert.roadStatus].label})</td><td>{p.km.toFixed(1)}</td><td>{corridor ? formatElevation(elevationAtKm(corridor.profile, p.km)) : "—"}</td></tr>
        ))}
      </tbody>
    </table>
  );

  if (!corridor) {
    return (
      <ChartCard title="Perfil de elevación · Carretera Central" subtitle="Lima → La Oroya · alertas en su km" table={table}>
        <div ref={ref} className="pr-chart__plot">
          <p className="pr-chart__empty">Cargando el perfil del corredor…</p>
        </div>
      </ChartCard>
    );
  }

  const linePath = corridor.profile.map((p, i) => `${i ? "L" : "M"}${x(p.km).toFixed(1)},${y(p.elevationM).toFixed(1)}`).join("");
  const areaPath = `${linePath}L${x(kmTotal)},${y(0)}L${x(0)},${y(0)}Z`;
  const placeLabels: typeof corridor.places = [];
  for (const place of corridor.places) {
    const last = placeLabels[placeLabels.length - 1];
    if (!last || x(place.km) - x(last.km) >= MIN_PLACE_LABEL_GAP_PX) placeLabels.push(place);
  }
  const shownKm = hoverKm ?? activeKm;
  const near = shownKm !== null ? nearestPlace(corridor.places, shownKm) : null;
  const kmAt = (clientX: number, rect: DOMRect) => Math.max(0, Math.min(kmTotal, ((clientX - rect.left - PAD.left) / plotW) * kmTotal));

  return (
    <ChartCard title="Perfil de elevación · Carretera Central" subtitle="Lima → La Oroya · alertas en su km" table={table}>
      <div ref={ref} className="pr-chart__plot">
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Perfil de elevación de la PE-22 desde Lima (km 0) hasta La Oroya, con el paso de Ticlio a 4 806 m"
            onPointerMove={(event) => {
              const km = kmAt(event.clientX, event.currentTarget.getBoundingClientRect());
              setHoverKm(km);
              onHoverKm(km);
            }}
            onPointerLeave={() => {
              setHoverKm(null);
              onHoverKm(null);
            }}
            onClick={(event) => onPickKm(kmAt(event.clientX, event.currentTarget.getBoundingClientRect()))}
          >
            {[0, 2500, 5000].map((m) => (
              <g key={m}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(m)} y2={y(m)} className="pr-grid" />
                <text x={PAD.left - 6} y={y(m)} className="pr-axis" textAnchor="end" dominantBaseline="middle">
                  {m === 0 ? "0" : `${m / 1000}k m`}
                </text>
              </g>
            ))}
            <path d={areaPath} fill={TERRAIN_INK} opacity={0.12} />
            <path d={linePath} fill="none" stroke={TERRAIN_INK} strokeWidth={1.6} strokeLinejoin="round" />
            {placeLabels.map((place) => (
              <g key={place.name}>
                <line x1={x(place.km)} x2={x(place.km)} y1={y(place.elevationM)} y2={y(0)} className="pr-place-tick" />
                <text x={x(place.km)} y={height - 4} className="pr-axis" textAnchor="middle">{place.name}</text>
              </g>
            ))}
            {shownKm !== null && (
              <g pointerEvents="none">
                <line x1={x(shownKm)} x2={x(shownKm)} y1={PAD.top - 6} y2={y(0)} className="pr-crosshair" />
                <circle cx={x(shownKm)} cy={y(elevationAtKm(corridor.profile, shownKm))} r={4} fill="#1f1c17" stroke="var(--surface)" strokeWidth={2} />
              </g>
            )}
            {visiblePlaced.map(({ alert, km }) => {
              const selected = alert.id === selectedId;
              return (
                <g
                  key={alert.id}
                  className="pr-profile-alert"
                  transform={`translate(${x(km)},${y(elevationAtKm(corridor.profile, km)) - 10})`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectAlert(alert.id);
                  }}
                >
                  <title>{`${STATUS_META[alert.roadStatus].label}: ${alert.title}`}</title>
                  <circle r={12} fill="transparent" />
                  <line y1={4} y2={10} stroke="#1f1c17" strokeWidth={1} opacity={0.5} />
                  <circle r={selected ? 6.5 : 5} fill={STATUS_META[alert.roadStatus].color} stroke="var(--surface)" strokeWidth={2} />
                </g>
              );
            })}
          </svg>
        )}
        {shownKm !== null && width > 0 && (
          <ChartTooltip x={x(shownKm)} y={PAD.top} width={width}>
            <span className="pr-tooltip__main">
              <strong>{formatElevation(elevationAtKm(corridor.profile, shownKm))}</strong> · km {shownKm.toFixed(0)}
            </span>
            {near && <span>{Math.abs(near.deltaKm) < 1.5 ? near.place.name : `${Math.abs(near.deltaKm).toFixed(0)} km de ${near.place.name}`}</span>}
          </ChartTooltip>
        )}
      </div>
    </ChartCard>
  );
}
