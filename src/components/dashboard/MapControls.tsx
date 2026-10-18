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

export function MapControls({
  mode,
  bearing,
  exaggeration,
  fullscreenTarget,
  onModeChange,
  onExaggerationChange,
  onResetNorth,
  onZoom,
}: MapControlsProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
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
        <div className="pr-mapctl__zoom" aria-label="Control de zoom">
          <button type="button" className="pr-icon-btn" onClick={() => onZoom(1)} aria-label="Acercar" title="Acercar (+)">
            +
          </button>
          <button type="button" className="pr-icon-btn" onClick={() => onZoom(-1)} aria-label="Alejar" title="Alejar (−)">
            −
          </button>
        </div>

        <div className="pr-mapctl__view-group">
          <button
            type="button"
            className={`pr-btn pr-btn--map-view${viewOpen ? " is-active" : ""}`}
            onClick={() => setViewOpen(!viewOpen)}
            aria-expanded={viewOpen}
            aria-label="Controles de vista del mapa"
          >
            <Icon name="layers" size={13} />
            <span>Vista ({mode.toUpperCase()})</span>
            <Icon name="chevronDown" size={12} />
          </button>

          {viewOpen && (
            <div className="pr-mapctl__view-popover" role="dialog" aria-label="Opciones de vista del mapa">
              <div className="pr-mapctl__popover-row">
                <span className="pr-mapctl__popover-label">Dimensión:</span>
                <div className="pr-segmented pr-segmented--dark" role="group" aria-label="Modo 2D o 3D">
                  <button type="button" className="pr-segmented__item" aria-pressed={mode === "2d"} onClick={() => onModeChange("2d")}>
                    2D
                  </button>
                  <button type="button" className="pr-segmented__item" aria-pressed={mode === "3d"} onClick={() => onModeChange("3d")}>
                    3D
                  </button>
                </div>
              </div>

              {mode === "3d" && (
                <div className="pr-mapctl__popover-row">
                  <span className="pr-mapctl__popover-label">Relieve 3D:</span>
                  <label className="pr-select pr-select--compact" title="Exageración vertical del terreno para evaluar pendientes">
                    <span className="pr-sr-only">Exageración del relieve</span>
                    <select value={exaggeration} onChange={(event) => onExaggerationChange(Number(event.target.value))}>
                      {EXAGGERATION_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value}× relieve
                        </option>
                      ))}
                    </select>
                    <Icon name="chevronDown" size={12} />
                  </label>
                </div>
              )}

              <div className="pr-mapctl__popover-row">
                <span className="pr-mapctl__popover-label">Pantalla:</span>
                <button type="button" className="pr-btn pr-btn--ghost pr-btn--sm" onClick={toggleFullscreen}>
                  <Icon name={fullscreen ? "minimize" : "maximize"} size={13} />
                  <span>{fullscreen ? "Salir" : "Pantalla completa"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
