"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/icons";

import { EXAGGERATION_OPTIONS, type MapMode } from "./types";

interface MapControlsProps {
  mode: MapMode;
  bearing: number;
  exaggeration: number;
  fullscreenTarget: () => HTMLElement | null;
  onModeChange: (mode: MapMode) => void;
  onExaggerationChange: (value: number) => void;
  onResetNorth: () => void;
  onZoom: (delta: number) => void;
}

export function MapControls({ mode, bearing, exaggeration, fullscreenTarget, onModeChange, onExaggerationChange, onResetNorth, onZoom }: MapControlsProps) {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = () => {
    const target = fullscreenTarget();
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (target?.requestFullscreen) void target.requestFullscreen();
  };

  return (
    <>
      <button
        type="button"
        className="pr-compass"
        onClick={onResetNorth}
        aria-label="Orientar al norte"
        title="Orientar al norte"
        style={{ transform: `rotate(${-bearing}deg)` }}
      >
        <span className="pr-compass__n">N</span>
        <Icon name="north" size={16} />
      </button>

      <div className="pr-mapctl">
        <div className="pr-mapctl__zoom">
          <button type="button" className="pr-icon-btn" onClick={() => onZoom(1)} aria-label="Acercar" title="Acercar">
            +
          </button>
          <button type="button" className="pr-icon-btn" onClick={() => onZoom(-1)} aria-label="Alejar" title="Alejar">
            −
          </button>
        </div>
        <div className="pr-segmented pr-segmented--dark" role="group" aria-label="Vista del mapa">
          <button type="button" className="pr-segmented__item" aria-pressed={mode === "2d"} onClick={() => onModeChange("2d")}>
            2D
          </button>
          <button type="button" className="pr-segmented__item" aria-pressed={mode === "3d"} onClick={() => onModeChange("3d")}>
            3D
          </button>
        </div>
        <label className="pr-select pr-select--compact" title="Exageración del relieve">
          <span className="pr-sr-only">Exageración del relieve</span>
          <select value={exaggeration} disabled={mode === "2d"} onChange={(event) => onExaggerationChange(Number(event.target.value))}>
            {EXAGGERATION_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}× relieve
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={12} />
        </label>
        <button
          type="button"
          className="pr-icon-btn"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          title={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
        >
          <Icon name={fullscreen ? "minimize" : "maximize"} size={15} />
        </button>
      </div>
    </>
  );
}
