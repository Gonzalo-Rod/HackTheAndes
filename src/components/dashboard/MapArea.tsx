"use client";

import { useRef, useState, type Ref } from "react";

import { Icon } from "@/components/icons";
import { MapView, type MapViewHandle, type MapViewProps } from "@/components/map/MapView";
import type { CorridorData } from "@/contracts/corridor";
import type { RoadAlert } from "@/contracts/road-alerts";

import { MapCallout } from "./MapCallout";
import { MapControls } from "./MapControls";
import { MapLegend } from "./MapLegend";
import { MapStateOverlay, type MapStateOverlayProps } from "./MapStateOverlay";
import { TourHud } from "./TourHud";
import type { LayerState, MapMode } from "./types";

const BASE_PADDING = { top: 64, right: 48, bottom: 64, left: 48 };
/** Extra bottom padding so a flown-to alert is not hidden behind the selected-alert card. */
const CALLOUT_PADDING = { ...BASE_PADDING, bottom: 190 };

type PassThrough = Pick<MapViewProps, "alerts" | "hiddenIds" | "hoveredId" | "corridorAlerts" | "highlightRegionKey" | "onHover">;

interface MapAreaProps extends PassThrough {
  mapRef: Ref<MapViewHandle>;
  handle: () => MapViewHandle | null;
  selected: RoadAlert | null;
  layers: LayerState;
  mode: MapMode;
  corridor: CorridorData | null;
  profileKm: number | null;
  now: number | null;
  status: Omit<MapStateOverlayProps, "mapReady" | "mapError">;
  onSelect: (id: string | null) => void;
  onLayersChange: (layers: LayerState) => void;
  onModeChange: (mode: MapMode) => void;
  onOpenDetail: () => void;
  onTourKm: (km: number | null) => void;
}

export function MapArea({
  mapRef,
  handle,
  selected,
  layers,
  mode,
  corridor,
  now,
  alerts,
  hiddenIds,
  hoveredId,
  corridorAlerts,
  highlightRegionKey,
  profileKm,
  status,
  onSelect,
  onHover,
  onLayersChange,
  onModeChange,
  onOpenDetail,
  onTourKm,
}: MapAreaProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [bearing, setBearing] = useState(0);
  const [touring, setTouring] = useState(false);
  const [tourKm, setTourKm] = useState<number | null>(null);
  const [orbiting, setOrbiting] = useState(false);

  return (
    <div className="pr-mapwrap" ref={wrapRef}>
      <MapView
        ref={mapRef}
        alerts={alerts}
        hiddenIds={hiddenIds}
        selectedId={selected?.id ?? null}
        hoveredId={hoveredId}
        layers={layers}
        mode={mode}
        corridor={corridor}
        corridorAlerts={corridorAlerts}
        highlightRegionKey={highlightRegionKey}
        profileKm={profileKm}
        padding={selected ? CALLOUT_PADDING : BASE_PADDING}
        onSelect={onSelect}
        onHover={onHover}
        onReady={() => setMapReady(true)}
        onError={setMapError}
        onBearingChange={(b) => setBearing(b)}
        onTourProgress={(km) => {
          setTourKm(km);
          onTourKm(km);
        }}
        onTourChange={setTouring}
        onOrbitChange={setOrbiting}
      />
      <MapControls
        mode={mode}
        bearing={bearing}
        exaggeration={layers.exaggeration}
        fullscreenTarget={() => wrapRef.current}
        onModeChange={onModeChange}
        onExaggerationChange={(exaggeration) => onLayersChange({ ...layers, exaggeration })}
        onResetNorth={() => handle()?.resetNorth()}
        onZoom={(delta) => handle()?.zoomBy(delta)}
      />
      <MapLegend layers={layers} />
      <div className="pr-maptools">
        <button
          type="button"
          className="pr-btn pr-btn--map"
          onClick={() => (touring ? handle()?.stopTour() : handle()?.startTour())}
          disabled={!corridor || !mapReady}
          aria-pressed={touring}
        >
          <Icon name={touring ? "pause" : "route"} size={14} />
          {touring ? "Detener recorrido" : "Recorrer la Carretera Central"}
        </button>
      </div>
      {touring && corridor && tourKm !== null && <TourHud corridor={corridor} km={tourKm} onStop={() => handle()?.stopTour()} />}
      {selected && !touring && (
        <MapCallout
          alert={selected}
          now={now}
          orbiting={orbiting}
          is3d={mode === "3d"}
          onOpenDetail={onOpenDetail}
          onToggleOrbit={() => handle()?.setOrbit(!orbiting, [selected.lng, selected.lat])}
          onClose={() => onSelect(null)}
        />
      )}
      <MapStateOverlay {...status} mapReady={mapReady} mapError={mapError} />
    </div>
  );
}
