"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { RoadAlert } from "@/contracts/road-alerts";
import type { CorridorData } from "@/contracts/corridor";
import type { CorridorRainResponse } from "@/contracts/weather";
import type { MapViewHandle } from "@/components/map/MapView";
import type { Scope } from "@/components/dashboard/types";
import { CAUSE_ORDER } from "@/components/alert-meta";
import { boundsOfPoints } from "@/domain/geo/measure";
import { elevationAtKm, nearestPlace, placeAlertsOnCorridor } from "@/domain/road-alerts/corridor-placement";
import {
  causeStatusMatrix,
  EMPTY_FILTERS,
  facetCounts,
  filterAlerts,
  hasActiveFilters,
  regionOptions,
  sortByRecentAction,
  summarizeAlerts,
  type AlertFilters,
} from "@/domain/road-alerts/filters";
import {
  cumulativeByDay,
  hiddenAtCursor,
  nextEventTime,
  previousEventTime,
  timelineWindow,
  type TimelineRange,
} from "@/domain/road-alerts/timeline";
import { rainAtKm, rainSegments } from "@/domain/weather/rain";
import { countByRoad } from "@/domain/road-alerts/staleness";
import { useAlertDetail } from "./use-alert-detail";
import { useTimelinePlayback } from "./use-timeline-playback";
const PE22 = "PE-22";
const EMPTY_SET: ReadonlySet<string> = new Set();
/** Padding around a region's reported incidents when focusing the map. */
const REGION_FIT_PADDING_DEG = 0.6;
const readDeepLink = () => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("alerta"));
export function useIncidentDashboard({
  allAlerts,
  corridor,
  rain,
  now,
  mapRef,
}: {
  allAlerts: RoadAlert[];
  corridor: CorridorData | null;
  rain: CorridorRainResponse | null;
  now: number | null;
  mapRef: RefObject<MapViewHandle | null>;
}) {
  const [scope, setScope] = useState<Scope>("pais");
  const [filters, setFilters] = useState<AlertFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(readDeepLink);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [range, setRange] = useState<TimelineRange>("30d");
  const [cursorMs, setCursorMs] = useState<number | null>(null); // null = today
  const [profileKm, setProfileKm] = useState<number | null>(null);
  const [tourKm, setTourKm] = useState<number | null>(null);
  const [detailReload, setDetailReload] = useState(0);

  const scopedFilters = useMemo(() => ({ ...filters, roadCode: scope === "pe22" ? PE22 : null }), [filters, scope]);
  const filtered = useMemo(() => sortByRecentAction(filterAlerts(allAlerts, scopedFilters)), [allAlerts, scopedFilters]);
  const facets = useMemo(() => facetCounts(allAlerts, scopedFilters), [allAlerts, scopedFilters]);
  const regions = useMemo(() => regionOptions(allAlerts), [allAlerts]);
  const summary = useMemo(() => summarizeAlerts(filtered), [filtered]);
  const matrix = useMemo(() => causeStatusMatrix(filtered, CAUSE_ORDER), [filtered]);
  const corridorAlerts = useMemo(() => (corridor ? placeAlertsOnCorridor(filtered, corridor) : []), [filtered, corridor]);
  const rainBands = useMemo(() => (rain && corridor ? rainSegments(rain.samples, corridor.kmTotal) : []), [rain, corridor]);
  const timeWindow = useMemo(() => timelineWindow(filtered, range, now ?? 0), [filtered, range, now]);
  const cumulative = useMemo(() => (now ? cumulativeByDay(filtered, timeWindow) : []), [filtered, timeWindow, now]);
  const hiddenIds = useMemo(() => (cursorMs === null ? EMPTY_SET : hiddenAtCursor(filtered, cursorMs)), [filtered, cursorMs]);
  const playback = useTimelinePlayback(timeWindow, cursorMs, setCursorMs);

  const selected = allAlerts.find((a) => a.id === selectedId) ?? null;
  const detail = useAlertDetail(selected?.id ?? null, detailReload);
  const filtersActive = hasActiveFilters(filters);
  const roadCounts = useMemo(() => countByRoad(allAlerts), [allAlerts]);
  const pe22Count = allAlerts.filter((a) => a.roadCode === PE22).length;
  const placedSelected = selected ? corridorAlerts.find((c) => c.alert.id === selected.id) : undefined;
  const near = placedSelected && corridor ? nearestPlace(corridor.places, placedSelected.km) : null;
  const corridorContext =
    placedSelected && corridor && near
      ? {
          km: placedSelected.km,
          elevationM: elevationAtKm(corridor.profile, placedSelected.km),
          nearestPlace: near.place.name,
          deltaKm: near.deltaKm,
          rain: rain ? rainAtKm(rain.samples, placedSelected.km) : null,
        }
      : null;

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      window.history.replaceState(null, "", id ? `?alerta=${encodeURIComponent(id)}` : window.location.pathname);
      const alert = id ? allAlerts.find((a) => a.id === id) : undefined;
      if (alert) mapRef.current?.flyToAlert(alert);
    },
    [allAlerts, mapRef],
  );

  // Fly to a deep-linked alert once its data has arrived (the camera ignores calls before the map loads).
  const deepLinkHandled = useRef(readDeepLink() === null);
  useEffect(() => {
    if (deepLinkHandled.current || !selected) return;
    deepLinkHandled.current = true;
    const timer = window.setTimeout(() => mapRef.current?.flyToAlert(selected), 1200);
    return () => window.clearTimeout(timer);
  }, [selected, mapRef]);

  const changeScope = (next: Scope) => {
    setScope(next);
    if (next === "pe22") mapRef.current?.flyToCorridor();
    else mapRef.current?.flyToPeru();
  };

  const changeFilters = (next: AlertFilters) => {
    if (next.regionKey && next.regionKey !== filters.regionKey) {
      const points = allAlerts.filter((a) => a.regionKey === next.regionKey).map((a): [number, number] => [a.lng, a.lat]);
      const bbox = boundsOfPoints(points, REGION_FIT_PADDING_DEG);
      if (bbox) mapRef.current?.flyToBounds(bbox);
    }
    setFilters(next);
  };

  const stepTimeline = (direction: -1 | 1) => {
    playback.stop();
    const from = cursorMs ?? timeWindow.endMs;
    const target = direction === 1 ? nextEventTime(filtered, from) : previousEventTime(filtered, from);
    if (target !== null) setCursorMs(target);
    else if (direction === 1) setCursorMs(null);
  };

  return {
    scope,
    filters,
    setFilters,
    setSelectedId,
    hoveredId,
    setHoveredId,
    range,
    setRange,
    cursorMs,
    setCursorMs,
    profileKm,
    setProfileKm,
    tourKm,
    setTourKm,
    setDetailReload,
    filtered,
    facets,
    regions,
    summary,
    matrix,
    corridorAlerts,
    rainBands,
    timeWindow,
    cumulative,
    hiddenIds,
    playback,
    selected,
    detail,
    filtersActive,
    roadCounts,
    pe22Count,
    corridorContext,
    select,
    changeScope,
    changeFilters,
    stepTimeline,
    clearFilters: () => setFilters(EMPTY_FILTERS),
  };
}
