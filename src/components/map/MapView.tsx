"use client";

import type { Map as MLMap, MapLayerMouseEvent, Popup } from "maplibre-gl";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import type { LayerState, MapMode } from "@/components/dashboard/types";
import type { CorridorData } from "@/contracts/corridor";
import type { RoadAlert } from "@/contracts/road-alerts";
import type { LngLat } from "@/domain/geo/measure";
import type { CorridorAlert } from "@/domain/road-alerts/corridor-placement";

import { createBaseStyle, TERRAIN_SOURCE } from "./basemap-style";
import { createCameraController, PERU_BOUNDS, type CameraController, type ScreenPadding } from "./map-camera";
import {
  addThematicLayers,
  applyLayerState,
  applyRegionHighlight,
  setAffectedStretches,
  setCorridorData,
  setProfilePoint,
  startFlowAnimation,
} from "./map-layers";
import { cullMarkers, syncMarkers, type MarkerEntry } from "./map-markers";

export type MapViewHandle = Omit<CameraController, "stopAll" | "flyToAlert"> & { flyToAlert: (alert: RoadAlert) => void };

export interface MapViewProps {
  ref?: Ref<MapViewHandle>;
  alerts: RoadAlert[];
  hiddenIds: ReadonlySet<string>;
  selectedId: string | null;
  hoveredId: string | null;
  layers: LayerState;
  mode: MapMode;
  corridor: CorridorData | null;
  corridorAlerts: CorridorAlert[];
  highlightRegionKey: string | null;
  profileKm: number | null;
  padding: ScreenPadding;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onReady: () => void;
  onError: (message: string) => void;
  onBearingChange: (bearing: number, pitch: number) => void;
  onTourProgress: (km: number | null) => void;
  onTourChange: (active: boolean) => void;
  onOrbitChange: (active: boolean) => void;
}

const MAPLIBRE_WORKER_PATH = "/maplibre/maplibre-gl-worker.mjs";
/** Tile and glyph errors are recoverable (the map keeps working); only style failures are fatal. */
const FATAL_ERROR_PATTERN = /style/i;

export function MapView(props: MapViewProps) {
  const { ref } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerClassRef = useRef<typeof import("maplibre-gl").Marker | null>(null);
  const cameraRef = useRef<CameraController | null>(null);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const readyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const latest = useRef(props);

  // Map event listeners read the latest props through this ref.
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    let cancelled = false;
    let stopFlow: (() => void) | null = null;
    let tooltip: Popup | null = null;
    const markers = markersRef.current;

    async function init() {
      const ml = await import("maplibre-gl");
      const container = containerRef.current;
      if (cancelled || !container) return;
      // Copied to public/ by scripts/copy-maplibre-worker.mjs (bundlers do not emit MapLibre 6's worker module).
      ml.setWorkerUrl(`${window.location.origin}${MAPLIBRE_WORKER_PATH}`);
      const coarse = window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900;
      const map = new ml.Map({
        container,
        style: createBaseStyle(),
        bounds: PERU_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        maxPitch: 78,
        attributionControl: false,
        cooperativeGestures: coarse,
        fadeDuration: 160,
        locale: {
          "CooperativeGesturesHandler.WindowsHelpText": "Usa Ctrl + rueda para hacer zoom en el mapa",
          "CooperativeGesturesHandler.MacHelpText": "Usa ⌘ + rueda para hacer zoom en el mapa",
          "CooperativeGesturesHandler.MobileHelpText": "Usa dos dedos para mover el mapa",
        },
      });
      mapRef.current = map;
      markerClassRef.current = ml.Marker;
      map.addControl(new ml.AttributionControl({ compact: true }), "bottom-left");
      map.addControl(new ml.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-right");
      cameraRef.current = createCameraController(map, {
        getPadding: () => latest.current.padding,
        getMode: () => latest.current.mode,
        getCorridor: () => latest.current.corridor,
        onTourProgress: (km) => latest.current.onTourProgress(km),
        onTourChange: (active) => latest.current.onTourChange(active),
        onOrbitChange: (active) => latest.current.onOrbitChange(active),
      });

      map.on("error", (event) => {
        if (!readyRef.current && FATAL_ERROR_PATTERN.test(event.error?.message ?? ""))
          latest.current.onError("No se pudo cargar el mapa base.");
      });
      map.on("load", () => {
        if (cancelled) return;
        // The container may have been resized by layout since construction; fit Peru to the final size.
        map.resize();
        map.fitBounds(PERU_BOUNDS, { padding: 24, animate: false });
        addThematicLayers(map, window.location.origin);
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) stopFlow = startFlowAnimation(map);
        readyRef.current = true;
        setMapReady(true);
        latest.current.onReady();
      });
      let cullFrame = 0;
      map.on("move", () => {
        if (cullFrame) return;
        cullFrame = requestAnimationFrame(() => {
          cullFrame = 0;
          cullMarkers(map, markers);
        });
      });
      map.on("rotate", () => latest.current.onBearingChange(map.getBearing(), map.getPitch()));
      map.on("pitch", () => latest.current.onBearingChange(map.getBearing(), map.getPitch()));
      const stopOnUserInput = (event: { originalEvent?: Event }) => {
        if (event.originalEvent) cameraRef.current?.stopAll();
      };
      map.on("mousedown", stopOnUserInput);
      map.on("touchstart", stopOnUserInput);
      map.on("wheel", stopOnUserInput);
      map.on("click", () => latest.current.onSelect(null));

      // Hovering the national network shows the official road code, surface and condition.
      tooltip = new ml.Popup({ closeButton: false, closeOnClick: false, className: "pr-map-tip", offset: 10, maxWidth: "260px" });
      map.on("mousemove", "network-line", (event: MapLayerMouseEvent) => {
        const properties = event.features?.[0]?.properties as { road?: string; surface?: string; condition?: string } | undefined;
        if (!properties || !tooltip) return;
        map.getCanvas().style.cursor = "help";
        const node = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = `Red vial nacional · ${properties.road ?? "—"}`;
        const meta = document.createElement("span");
        meta.textContent = `${properties.surface ?? "Sin dato"} · estado ${String(properties.condition ?? "sin dato").toLowerCase()} (MTC)`;
        node.append(title, meta);
        tooltip.setLngLat(event.lngLat).setDOMContent(node).addTo(map);
      });
      map.on("mouseleave", "network-line", () => {
        map.getCanvas().style.cursor = "";
        tooltip?.remove();
      });
    }

    init().catch((error: unknown) => {
      // WebGL unavailable or the map bundle failed to load: show the error state instead of a blank map.
      console.error(
        JSON.stringify({
          level: "error",
          operation: "map.init",
          result: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      latest.current.onError("Este navegador no puede mostrar el mapa (WebGL no disponible).");
    });

    return () => {
      cancelled = true;
      stopFlow?.();
      cameraRef.current?.stopAll();
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  const { layers, mode, corridor, corridorAlerts, highlightRegionKey, profileKm, alerts, hiddenIds, selectedId, hoveredId } = props;
  useEffect(() => {
    if (mapRef.current && readyRef.current) applyLayerState(mapRef.current, layers);
  }, [layers, mapReady]);

  useEffect(() => {
    if (mapRef.current && readyRef.current) applyRegionHighlight(mapRef.current, highlightRegionKey);
  }, [highlightRegionKey, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setTerrain(mode === "3d" && layers.terrain ? { source: TERRAIN_SOURCE, exaggeration: layers.exaggeration } : null);
  }, [mode, layers.terrain, layers.exaggeration, mapReady]);

  // The national overview starts flat; the camera tilts only when the user changes the mode (or on fly-tos).
  const appliedMode = useRef(mode);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedMode.current === mode) return;
    appliedMode.current = mode;
    if (mode === "2d") map.easeTo({ pitch: 0, duration: 900 });
    else if (map.getPitch() < 20) map.easeTo({ pitch: map.getZoom() > 7 ? 58 : 35, duration: 900 });
  }, [mode]);

  useEffect(() => {
    if (mapRef.current && readyRef.current && corridor) setCorridorData(mapRef.current, corridor);
  }, [corridor, mapReady]);

  useEffect(() => {
    if (mapRef.current && readyRef.current && corridor) setAffectedStretches(mapRef.current, corridor, corridorAlerts, hiddenIds);
  }, [corridor, corridorAlerts, hiddenIds, mapReady]);

  useEffect(() => {
    if (mapRef.current && readyRef.current) setProfilePoint(mapRef.current, corridor, profileKm);
  }, [profileKm, corridor, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const MarkerClass = markerClassRef.current;
    if (!map || !MarkerClass) return;
    syncMarkers(map, MarkerClass, markersRef.current, {
      alerts: layers.alerts ? alerts : [],
      hiddenIds,
      selectedId,
      hoveredId,
      onSelect: (id) => latest.current.onSelect(id),
      onHover: (id) => latest.current.onHover(id),
    });
  }, [alerts, hiddenIds, selectedId, hoveredId, layers.alerts, mapReady]);

  useImperativeHandle(ref, (): MapViewHandle => {
    const camera = () => cameraRef.current;
    return {
      flyToPeru: () => camera()?.flyToPeru(),
      flyToCorridor: () => camera()?.flyToCorridor(),
      flyToAlert: (alert) => camera()?.flyToAlert([alert.lng, alert.lat]),
      flyToBounds: (bbox) => camera()?.flyToBounds(bbox),
      flyToKm: (km) => camera()?.flyToKm(km),
      startTour: () => camera()?.startTour(),
      stopTour: () => camera()?.stopTour(),
      setOrbit: (on: boolean, center?: LngLat) => camera()?.setOrbit(on, center),
      resetNorth: () => camera()?.resetNorth(),
      zoomBy: (delta) => camera()?.zoomBy(delta),
    };
  }, []);

  return <div ref={containerRef} className="pr-map" role="region" aria-label="Mapa de alertas viales del Perú" />;
}
