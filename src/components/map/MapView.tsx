"use client";
import { bindNetworkTooltip } from "./network-tooltip";
import type { HazardLayer } from "@/contracts/model-inputs";
import type { ForecastMapData } from "@/domain/exposure/forecast-map";
import { addForecastLayers, setForecastData, bindForecastSelection } from "./forecast-layers";
import { setHazardData } from "./hazard-layers";

import type { Map as MLMap, Popup } from "maplibre-gl";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import type { CatchmentLayer } from "@/contracts/catchments";
import { setCatchmentData } from "./catchment-layers";
import type { LayerState, MapMode, Scope } from "@/components/dashboard/types";
import type { CorridorData } from "@/contracts/corridor";
import type { RoadAlert } from "@/contracts/road-alerts";
import type { LngLat } from "@/domain/geo/measure";
import type { RainSegment } from "@/domain/weather/rain";
import type { CorridorAlert } from "@/domain/road-alerts/corridor-placement";
import type { EvidencePoint } from "@/domain/research/evidence-state_christian";
import type { EnvironmentalRecord } from "@/contracts/research_christian";

import { createBaseStyle, TERRAIN_SOURCE } from "./basemap-style";
import { createCameraController, PERU_BOUNDS, type CameraController, type ScreenPadding } from "./map-camera";
import {
  addThematicLayers,
  applyLayerState,
  applyRegionHighlight,
  setAffectedStretches,
  setCorridorData,
  setCorridorRain,
  setProfilePoint,
  startFlowAnimation,
} from "./map-layers";
import { cullMarkers, disposeMarkers, syncMarkers, type MarkerEntry } from "./map-markers";
import { addEnvironmentLayers, selectEnvironmentFeature, syncEnvironmentLayers } from "./environment-layers_christian";

export type MapViewHandle = Omit<CameraController, "stopAll" | "flyToAlert"> & {
  flyToAlert: (alert: RoadAlert) => void;
  flyToEvidence: (coordinates: [number, number]) => void;
};

export interface MapViewProps {
  ref?: Ref<MapViewHandle>;
  alerts: RoadAlert[];
  evidence: EvidencePoint[];
  evidenceAreas: EnvironmentalRecord[];
  evidenceNow: number;
  selectedEvidenceId: string | null;
  initialScope: Scope;
  hiddenIds: ReadonlySet<string>;
  selectedId: string | null;
  hoveredId: string | null;
  layers: LayerState;
  mode: MapMode;
  corridor: CorridorData | null;
  corridorAlerts: CorridorAlert[];
  rainSegments: RainSegment[];
  catchments: CatchmentLayer | null;
  hazards: HazardLayer | null;
  forecastData: ForecastMapData;
  selectedForecastId: string | null;
  onForecastSelect: (id: string) => void;
  highlightRegionKey: string | null;
  profileKm: number | null;
  padding: ScreenPadding;
  /** Padding while an alert is selected, so the target stays clear of the selected-alert card. */
  focusPadding: ScreenPadding;
  onSelect: (id: string | null) => void;
  onSelectEvidence: (id: string) => void;
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
  const pendingBoundsRef = useRef<[number, number, number, number] | null>(null);
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
        getFocusPadding: () => latest.current.focusPadding,
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
        addForecastLayers(map);
        bindForecastSelection(map, (id) => latest.current.onForecastSelect(id));
        addEnvironmentLayers(map);
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) stopFlow = startFlowAnimation(map);
        readyRef.current = true;
        setMapReady(true);
        latest.current.onReady();
        if (pendingBoundsRef.current) {
          cameraRef.current?.flyToBounds(pendingBoundsRef.current);
          pendingBoundsRef.current = null;
        }
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
      map.on("click", (event) => {
        if (!selectEnvironmentFeature(map, event, (id) => latest.current.onSelectEvidence(id))) latest.current.onSelect(null);
      });

      tooltip = new ml.Popup({ closeButton: false, closeOnClick: false, className: "pr-map-tip", offset: 10, maxWidth: "260px" });
      bindNetworkTooltip(map, tooltip);
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
      disposeMarkers(markers);
      mapRef.current?.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  const {
    catchments,
    layers,
    mode,
    corridor,
    corridorAlerts,
    rainSegments,
    highlightRegionKey,
    profileKm,
    alerts,
    hiddenIds,
    selectedId,
    hoveredId,
  } = props;
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

  // Keep the map padding in sync with the selected-alert card. Selecting an alert starts a flight that
  // already ends with the focus padding, so moving maps are left alone.
  const hasSelection = selectedId !== null;
  const { padding, focusPadding } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || map.isMoving()) return;
    map.easeTo({ padding: hasSelection ? focusPadding : padding, duration: 400 });
  }, [hasSelection, padding, focusPadding, mapReady]);

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
    if (mapRef.current && readyRef.current) setForecastData(mapRef.current, props.forecastData, layers.exposure, props.selectedForecastId);
  }, [props.forecastData, props.selectedForecastId, layers.exposure, mapReady]);

  useEffect(() => {
    if (mapRef.current && readyRef.current) {
      setCatchmentData(mapRef.current, catchments);
      setHazardData(mapRef.current, props.hazards);
    }
  }, [catchments, props.hazards, mapReady]);

  useEffect(() => {
    if (mapRef.current && readyRef.current && corridor) setCorridorData(mapRef.current, corridor);
  }, [corridor, mapReady]);

  const initialCameraApplied = useRef(false);
  useEffect(() => {
    if (!mapReady || !corridor || initialCameraApplied.current) return;
    initialCameraApplied.current = true;
    const hasEvidencePoint = props.evidence.some((point) => point.recordIds.includes(props.selectedEvidenceId ?? ""));
    if (props.initialScope === "pe22" && !selectedId && !hasEvidencePoint) cameraRef.current?.flyToCorridor();
  }, [mapReady, corridor, props.initialScope, selectedId, props.selectedEvidenceId, props.evidence]);

  useEffect(() => {
    if (mapRef.current && readyRef.current) setCorridorRain(mapRef.current, corridor, rainSegments);
  }, [corridor, rainSegments, mapReady]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    syncEnvironmentLayers(
      map,
      layers.environment ? props.evidenceAreas : [],
      layers.environment ? props.evidence : [],
      props.selectedEvidenceId,
      props.evidenceNow,
    );
  }, [props.evidence, props.evidenceAreas, props.selectedEvidenceId, props.evidenceNow, layers.environment, mapReady]);

  useImperativeHandle(ref, (): MapViewHandle => {
    const camera = () => cameraRef.current;
    return {
      flyToPeru: () => camera()?.flyToPeru(),
      flyToCorridor: () => camera()?.flyToCorridor(),
      flyToAlert: (alert) => camera()?.flyToAlert([alert.lng, alert.lat]),
      flyToEvidence: (coordinates) => camera()?.flyToAlert(coordinates),
      flyToBounds: (bbox) => {
        if (readyRef.current) camera()?.flyToBounds(bbox);
        else pendingBoundsRef.current = bbox;
      },
      flyToKm: (km) => camera()?.flyToKm(km),
      startTour: () => camera()?.startTour(),
      stopTour: () => camera()?.stopTour(),
      setOrbit: (on: boolean, center?: LngLat) => camera()?.setOrbit(on, center),
      resetNorth: () => camera()?.resetNorth(),
      zoomBy: (delta) => camera()?.zoomBy(delta),
    };
  }, []);

  return <div ref={containerRef} className="pr-map" role="region" aria-label="Mapa de alertas viales y referencias ambientales del Perú" />;
}
