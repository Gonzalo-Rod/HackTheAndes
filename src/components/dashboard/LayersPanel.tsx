"use client";

import type { ReactNode } from "react";

import type { CorridorData } from "@/contracts/corridor";
import type { AlertsMeta } from "@/contracts/road-alerts";
import type { CorridorRainResponse } from "@/contracts/weather";
import { RAIN_LEVELS } from "@/domain/weather/rain";
import { formatDateTime, formatRelative } from "@/lib/format";

import type { LayerState } from "./types";

type Freshness = { text: string; warn: boolean };

/** Per-layer data age line, so it is clear which layers are live and which are a static download. */
function alertsFreshness(meta: AlertsMeta | null, now: number | null): Freshness | undefined {
  if (!meta || !now) return undefined;
  const age = formatRelative(meta.fetchedAt, now);
  if (meta.fallback === "snapshot") return { text: `Instantánea guardada · ${age}`, warn: true };
  if (meta.stale || meta.fallback === "cache") return { text: `Caché del servidor · ${age}`, warn: true };
  const outdated = now - Date.parse(meta.fetchedAt) > 5 * 60_000;
  return { text: `En vivo · consultado ${age}`, warn: outdated };
}

function rainFreshness(rain: CorridorRainResponse | null, error: string | null, now: number | null): Freshness | undefined {
  if (!now) return undefined;
  if (!rain) return error ? { text: "Pronóstico no disponible", warn: true } : undefined;
  const age = formatRelative(rain.fetchedAt, now);
  return rain.stale || error
    ? { text: `Fuente no disponible o incompleta · datos de ${age}`, warn: true }
    : { text: `Open-Meteo · consultado ${age}`, warn: false };
}

function staticFreshness(corridor: CorridorData | null, now: number | null, label: string): Freshness | undefined {
  if (!corridor || !now) return undefined;
  return { text: `${label} · descargado ${formatRelative(corridor.metadata.retrievedAt, now)}`, warn: false };
}

interface LayerRowProps {
  label: string;
  hint?: string;
  freshness?: Freshness;
  swatch: ReactNode;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  opacity?: number;
  onOpacity?: (value: number) => void;
  disabled?: boolean;
  children?: ReactNode;
}

function LayerRow({ label, hint, freshness, swatch, checked, onToggle, opacity, onOpacity, disabled, children }: LayerRowProps) {
  const id = `layer-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <li className={`pr-layer${checked ? "" : " is-off"}`}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onToggle(event.target.checked)} />
      <span className="pr-layer__swatch" aria-hidden="true">
        {swatch}
      </span>
      <label htmlFor={id} className="pr-layer__label">
        {label}
        {hint && <span className="pr-layer__hint">{hint}</span>}
        {freshness && (
          <span className={`pr-layer__fresh${freshness.warn ? " is-warn" : ""}`}>
            <span className="pr-layer__fresh-dot" aria-hidden="true" />
            {freshness.text}
          </span>
        )}
      </label>
      {onOpacity && opacity !== undefined && (
        <span className="pr-layer__opacity">
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={opacity}
            disabled={!checked || disabled}
            onChange={(event) => onOpacity(Number(event.target.value))}
            aria-label={`Opacidad de ${label}`}
          />
          <span className="pr-layer__pct">{Math.round(opacity * 100)}%</span>
        </span>
      )}
      {children}
    </li>
  );
}

interface LayersPanelProps {
  layers: LayerState;
  is3d: boolean;
  meta: AlertsMeta | null;
  corridor: CorridorData | null;
  rain: CorridorRainResponse | null;
  rainError: string | null;
  environmentalCount: number;
  environmentalRetrievedAt: string | null;
  now: number | null;
  onChange: (layers: LayerState) => void;
}

export function LayersPanel({
  layers,
  is3d,
  meta,
  corridor,
  rain,
  rainError,
  environmentalCount,
  environmentalRetrievedAt,
  now,
  onChange,
}: LayersPanelProps) {
  const set = (patch: Partial<LayerState>) => onChange({ ...layers, ...patch });
  return (
    <ul className="pr-layers">
      <LayerRow
        label="Alertas viales"
        hint="SUTRAN y reportes comunitarios no confirmados"
        freshness={alertsFreshness(meta, now)}
        swatch={<span className="sw sw--alerts" />}
        checked={layers.alerts}
        onToggle={(alerts) => set({ alerts })}
      />
      <LayerRow
        label="Referencias ambientales"
        hint={`${environmentalCount} referencias oficiales; zonas críticas y pronósticos, no eventos confirmados`}
        freshness={{
          text: environmentalRetrievedAt ? `Captura revisada: ${formatDateTime(environmentalRetrievedAt)}` : "Investigación no disponible",
          warn: !environmentalRetrievedAt,
        }}
        swatch={<span className="pr-evidence-key pr-evidence-key--critical">!</span>}
        checked={layers.environment}
        onToggle={(environment) => set({ environment })}
      />
      <LayerRow
        label="Carretera Central"
        hint="Eje PE-22, km y lugares"
        freshness={staticFreshness(corridor, now, "Capa estática")}
        swatch={<span className="sw sw--corridor" />}
        checked={layers.corridor}
        onToggle={(corridor) => set({ corridor })}
      />
      <LayerRow
        label="Lluvia en la PE-22"
        hint="Últimas y próximas 24 h (el mayor valor)"
        freshness={rainFreshness(rain, rainError, now)}
        swatch={<span className="sw sw--rain" />}
        checked={layers.rain}
        disabled={!layers.corridor}
        onToggle={(rainOn) => set({ rain: rainOn })}
      >
        <span className="pr-layer__extra pr-rain-legend" aria-label="Escala de lluvia">
          {RAIN_LEVELS.map((level) => (
            <span key={level.level} className="pr-rain-legend__item">
              <span className="pr-rain-legend__chip" style={{ background: level.color }} aria-hidden="true" />
              {level.label} · {level.minMm === 0 ? "<1" : `≥${level.minMm}`} mm
            </span>
          ))}
        </span>
      </LayerRow>
      <LayerRow
        label="Red vial nacional"
        hint="MTC vía SUTRAN"
        freshness={staticFreshness(corridor, now, "Capa estática")}
        swatch={<span className="sw sw--network" />}
        checked={layers.network}
        onToggle={(network) => set({ network })}
        opacity={layers.networkOpacity}
        onOpacity={(networkOpacity) => set({ networkOpacity })}
      >
        <span className="pr-layer__extra">
          <label className="pr-switch">
            <input
              type="checkbox"
              checked={layers.networkColorBy === "condition"}
              disabled={!layers.network}
              onChange={(event) => set({ networkColorBy: event.target.checked ? "condition" : "neutral" })}
            />
            Colorear por estado de conservación
          </label>
        </span>
      </LayerRow>
      <LayerRow
        label="Cuencas aproximadas"
        hint="HydroBASINS · confianza baja; no riesgo calculado"
        swatch={<span style={{ display: "inline-block", width: 14, height: 10, border: "1px dashed #77618e", background: "#77618e22" }} />}
        checked={layers.catchments}
        onToggle={(catchments) => set({ catchments })}
      />
      <LayerRow
        label="Susceptibilidad · INGEMMET"
        hint="Estática · marrón claro a oscuro: muy baja a muy alta; gris: sin clasificar. No es pronóstico."
        swatch={<span style={{ display: "inline-block", width: 14, height: 10, background: "#ae8966" }} />}
        checked={layers.susceptibility}
        onToggle={(susceptibility) => set({ susceptibility })}
      />
      <LayerRow
        label="Avisos · SENAMHI"
        hint="Quebradas · vigencia según boletín; no son niveles de nuestro modelo."
        swatch={<span style={{ display: "inline-block", width: 14, height: 10, border: "1px dashed #72558a" }} />}
        checked={layers.officialWarnings}
        onToggle={(officialWarnings) => set({ officialWarnings })}
      />
      <LayerRow
        label="Ríos y quebradas"
        hint="ANA vía SUTRAN"
        freshness={staticFreshness(corridor, now, "Capa estática")}
        swatch={<span className="sw sw--rivers" />}
        checked={layers.rivers}
        onToggle={(rivers) => set({ rivers })}
        opacity={layers.riversOpacity}
        onOpacity={(riversOpacity) => set({ riversOpacity })}
      />
      <LayerRow
        label="Terreno 3D"
        hint={is3d ? "Relieve exagerado" : "Activa la vista 3D"}
        swatch={<span className="sw sw--terrain" />}
        checked={layers.terrain}
        disabled={!is3d}
        onToggle={(terrain) => set({ terrain })}
      />
      <LayerRow
        label="Sombreado de relieve"
        swatch={<span className="sw sw--hillshade" />}
        checked={layers.hillshade}
        onToggle={(hillshade) => set({ hillshade })}
        opacity={layers.hillshadeOpacity}
        onOpacity={(hillshadeOpacity) => set({ hillshadeOpacity })}
      />
      <LayerRow
        label="Imagen satelital"
        hint="Esri World Imagery (alta resolución)"
        swatch={<span className="sw sw--satellite" />}
        checked={layers.satellite}
        onToggle={(satellite) => set({ satellite })}
        opacity={layers.satelliteOpacity}
        onOpacity={(satelliteOpacity) => set({ satelliteOpacity })}
      />
      <LayerRow
        label="Límites regionales"
        swatch={<span className="sw sw--regions" />}
        checked={layers.regions}
        onToggle={(regions) => set({ regions })}
      />
    </ul>
  );
}
