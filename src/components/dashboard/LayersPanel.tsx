"use client";

import type { ReactNode } from "react";

import type { LayerState } from "./types";

interface LayerRowProps {
  label: string;
  hint?: string;
  swatch: ReactNode;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  opacity?: number;
  onOpacity?: (value: number) => void;
  disabled?: boolean;
  children?: ReactNode;
}

function LayerRow({ label, hint, swatch, checked, onToggle, opacity, onOpacity, disabled, children }: LayerRowProps) {
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
  onChange: (layers: LayerState) => void;
}

export function LayersPanel({ layers, is3d, onChange }: LayersPanelProps) {
  const set = (patch: Partial<LayerState>) => onChange({ ...layers, ...patch });
  return (
    <ul className="pr-layers">
      <LayerRow
        label="Alertas SUTRAN"
        hint="Vigentes, oficiales"
        swatch={<span className="sw sw--alerts" />}
        checked={layers.alerts}
        onToggle={(alerts) => set({ alerts })}
      />
      <LayerRow
        label="Carretera Central"
        hint="Eje PE-22, km y lugares"
        swatch={<span className="sw sw--corridor" />}
        checked={layers.corridor}
        onToggle={(corridor) => set({ corridor })}
      />
      <LayerRow
        label="Red vial nacional"
        hint="MTC vía SUTRAN"
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
        label="Ríos y quebradas"
        hint="ANA vía SUTRAN"
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
        hint="Sentinel-2 cloudless 2016"
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
