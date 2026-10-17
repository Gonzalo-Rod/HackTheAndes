"use client";
import { useModelInputs } from "@/hooks/use-model-inputs";
import { useCatchments } from "@/hooks/use-catchments";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CAUSE_ORDER } from "@/components/alert-meta";
import { CauseStatusChart } from "@/components/charts/CauseStatusChart";
import { CumulativeChart } from "@/components/charts/CumulativeChart";
import { ElevationProfile } from "@/components/charts/ElevationProfile";
import { Icon } from "@/components/icons";
import type { MapViewHandle } from "@/components/map/MapView";
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
  toggleValue,
  type AlertFilters,
} from "@/domain/road-alerts/filters";
import {
  countBefore,
  cumulativeByDay,
  hiddenAtCursor,
  nextEventTime,
  previousEventTime,
  timelineWindow,
  type TimelineRange,
} from "@/domain/road-alerts/timeline";
import { rainAtKm, rainSegments } from "@/domain/weather/rain";
import { countByRoad } from "@/domain/road-alerts/staleness";
import { useAlertDetail } from "@/hooks/use-alert-detail";
import { useCorridorRain } from "@/hooks/use-corridor-rain";
import { useCommunityIncidents } from "@/hooks/use-community-incidents";
import { useCorridor } from "@/hooks/use-corridor";
import { useNow } from "@/hooks/use-now";
import { useRoadAlerts } from "@/hooks/use-road-alerts";
import { useTimelinePlayback } from "@/hooks/use-timeline-playback";

import { AlertDetail } from "./AlertDetail";
import { EventList } from "./EventList";
import { FilterBar } from "./FilterBar";
import { LayersPanel } from "./LayersPanel";
import { MapArea } from "./MapArea";
import { Sidebar } from "./Sidebar";
import { SourcesPanel } from "./SourcesPanel";
import { SummaryPanel } from "./SummaryPanel";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";
import { DEFAULT_LAYERS, type MapMode, type Scope, type SidebarTab } from "./types";

const PE22 = "PE-22";
const EMPTY_SET: ReadonlySet<string> = new Set();
/** Padding (degrees) around a region's alerts when the map flies to them. */
const REGION_FIT_PADDING_DEG = 0.6;

const readDeepLink = () => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("alerta"));

export function Dashboard() {
  const alertsState = useRoadAlerts();
  const community = useCommunityIncidents();
  const corridorState = useCorridor();
  const rainState = useCorridorRain();
  const catchments = useCatchments();
  const modelInputs = useModelInputs();
  const now = useNow();
  const mapRef = useRef<MapViewHandle>(null);

  const [scope, setScope] = useState<Scope>("pais");
  const [filters, setFilters] = useState<AlertFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(readDeepLink);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [mode, setMode] = useState<MapMode>("3d");
  const [tabChoice, setTabChoice] = useState<SidebarTab | null>(null); // null = automatic
  const [range, setRange] = useState<TimelineRange>("30d");
  const [cursorMs, setCursorMs] = useState<number | null>(null); // null = today
  const [profileKm, setProfileKm] = useState<number | null>(null);
  const [tourKm, setTourKm] = useState<number | null>(null);
  const [detailReload, setDetailReload] = useState(0);

  const corridor = corridorState.status === "ready" ? corridorState.data : null;
  const allAlerts = useMemo(() => [...(alertsState.data?.alerts ?? []), ...community.alerts], [alertsState.data, community.alerts]);
  const scopedFilters = useMemo(() => ({ ...filters, roadCode: scope === "pe22" ? PE22 : null }), [filters, scope]);
  const filtered = useMemo(() => sortByRecentAction(filterAlerts(allAlerts, scopedFilters)), [allAlerts, scopedFilters]);
  const facets = useMemo(() => facetCounts(allAlerts, scopedFilters), [allAlerts, scopedFilters]);
  const regions = useMemo(() => regionOptions(allAlerts), [allAlerts]);
  const summary = useMemo(() => summarizeAlerts(filtered), [filtered]);
  const matrix = useMemo(() => causeStatusMatrix(filtered, CAUSE_ORDER), [filtered]);
  const corridorAlerts = useMemo(() => (corridor ? placeAlertsOnCorridor(filtered, corridor) : []), [filtered, corridor]);
  const rain = rainState.data;
  const rainBands = useMemo(() => (rain && corridor ? rainSegments(rain.samples, corridor.kmTotal) : []), [rain, corridor]);
  const timeWindow = useMemo(() => timelineWindow(filtered, range, now ?? 0), [filtered, range, now]);
  const cumulative = useMemo(() => (now ? cumulativeByDay(filtered, timeWindow) : []), [filtered, timeWindow, now]);
  const hiddenIds = useMemo(() => (cursorMs === null ? EMPTY_SET : hiddenAtCursor(filtered, cursorMs)), [filtered, cursorMs]);
  const playback = useTimelinePlayback(timeWindow, cursorMs, setCursorMs);

  const selected = allAlerts.find((a) => a.id === selectedId) ?? null;
  const detail = useAlertDetail(selected?.id ?? null, detailReload);
  const tab: SidebarTab = tabChoice ?? (selected ? "detalle" : "capas");
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
      setTabChoice(null);
      window.history.replaceState(null, "", id ? `?alerta=${encodeURIComponent(id)}` : window.location.pathname);
      const alert = id ? allAlerts.find((a) => a.id === id) : undefined;
      if (alert) mapRef.current?.flyToAlert(alert);
    },
    [allAlerts],
  );

  // Fly to a deep-linked alert once its data has arrived (the camera ignores calls before the map loads).
  const deepLinkHandled = useRef(readDeepLink() === null);
  useEffect(() => {
    if (deepLinkHandled.current || !selected) return;
    deepLinkHandled.current = true;
    const timer = window.setTimeout(() => mapRef.current?.flyToAlert(selected), 1200);
    return () => window.clearTimeout(timer);
  }, [selected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      mapRef.current?.stopTour();
      setSelectedId(null);
      setTabChoice(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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

  const loading = alertsState.status === "loading";
  const emptyReason = loading || filtered.length ? null : filtersActive ? "filters" : "none";
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  return (
    <div className="pr-app">
      <TopBar
        communityStatus={community.error ?? (community.connection === "live" ? "Comunidad · en vivo" : "Comunidad · consulta cada minuto")}
        scope={scope}
        counts={{ pais: allAlerts.length, pe22: pe22Count }}
        meta={alertsState.data?.meta ?? null}
        loading={loading}
        refreshing={alertsState.refreshing}
        error={alertsState.error}
        now={now}
        onScopeChange={changeScope}
        onRefresh={alertsState.refresh}
        onOpenSources={() => setTabChoice("fuentes")}
      />
      <FilterBar
        filters={filters}
        facets={facets}
        regions={regions}
        resultCount={filtered.length}
        totalCount={scope === "pe22" ? pe22Count : allAlerts.length}
        active={filtersActive}
        onChange={changeFilters}
        onClear={clearFilters}
      />

      <main className="pr-main">
        <MapArea
          mapRef={mapRef}
          handle={() => mapRef.current}
          alerts={filtered}
          hiddenIds={hiddenIds}
          hoveredId={hoveredId}
          selected={selected}
          layers={layers}
          mode={mode}
          corridor={corridor}
          corridorAlerts={corridorAlerts}
          rainSegments={rainBands}
          catchments={catchments.data}
          hazards={modelInputs.hazards.data}
          highlightRegionKey={filters.regionKey}
          profileKm={tourKm ?? profileKm}
          now={now}
          status={{
            loading,
            dataError: alertsState.status === "error" ? alertsState.error : null,
            staleMessage:
              [
                alertsState.data && alertsState.error ? alertsState.error : null,
                corridor?.metadata.state === "snapshot" ? corridor.metadata.message : null,
                community.error,
                catchments.error,
                modelInputs.hazards.error,
                modelInputs.weather.error,
                modelInputs.weather.data?.meta.stale ? "Lluvia por cuenca en caché; revisar la fecha del pronóstico." : null,
                modelInputs.hazards.data?.meta.stale ? "Avisos oficiales en caché; revisar su vigencia." : null,
                catchments.data?.meta.state === "snapshot" ? catchments.data.meta.message : null,
              ]
                .filter(Boolean)
                .join(" ") || null,
            refreshing: alertsState.refreshing,
            onRetry: alertsState.refresh,
          }}
          onSelect={select}
          onHover={setHoveredId}
          onLayersChange={setLayers}
          onModeChange={setMode}
          onOpenDetail={() => setTabChoice("detalle")}
          onTourKm={setTourKm}
        />

        <Sidebar
          tab={tab}
          hasSelection={selected !== null}
          onTabChange={setTabChoice}
          layersContent={
            <>
              <SummaryPanel
                summary={summary}
                scope={scope}
                latestActionAt={alertsState.data?.meta.latestActionAt ?? null}
                now={now}
                filtered={filtersActive}
              />
              <section className="pr-panel" aria-labelledby="layers-title">
                <header className="pr-panel__head">
                  <h2 id="layers-title">Capas</h2>
                </header>
                <LayersPanel
                  layers={layers}
                  is3d={mode === "3d"}
                  meta={alertsState.data?.meta ?? null}
                  corridor={corridor}
                  rain={rain}
                  rainError={rainState.error}
                  now={now}
                  onChange={setLayers}
                />
              </section>
            </>
          }
          detailContent={
            selected ? (
              <AlertDetail
                alert={selected}
                detail={detail}
                corridorContext={corridorContext}
                roadAlertCount={roadCounts.get(selected.roadCode) ?? 0}
                now={now}
                onRetryDetail={() => setDetailReload((n) => n + 1)}
                onCenter={() => mapRef.current?.flyToAlert(selected)}
                onClose={() => select(null)}
              />
            ) : (
              <div className="pr-empty pr-empty--panel">
                <Icon name="pin" size={20} />
                <p>Selecciona una alerta en el mapa, la línea de tiempo o la lista de eventos para ver su detalle e historial.</p>
              </div>
            )
          }
          sourcesContent={
            <SourcesPanel
              meta={alertsState.data?.meta ?? null}
              corridor={corridor}
              rain={rain}
              hazards={modelInputs.hazards.data}
              catchmentWeather={modelInputs.weather.data}
            />
          }
        />

        <div className="pr-dock">
          <div className="pr-dock__main">
            <Timeline
              alerts={filtered}
              window={timeWindow}
              range={range}
              cursorMs={cursorMs}
              playing={playback.playing}
              earlierCount={countBefore(filtered, timeWindow.startMs)}
              selectedId={selected?.id ?? null}
              onRangeChange={setRange}
              onCursorChange={(ms) => {
                playback.stop();
                setCursorMs(ms);
              }}
              onTogglePlay={playback.toggle}
              onStep={stepTimeline}
              onSelect={select}
              onHover={setHoveredId}
            />
            <div className="pr-charts">
              <CumulativeChart points={cumulative} window={timeWindow} cursorMs={cursorMs} onPickDay={setCursorMs} />
              <CauseStatusChart
                rows={matrix}
                activeCauses={filters.causes}
                onToggleCause={(cause) => setFilters({ ...filters, causes: toggleValue(filters.causes, cause) })}
              />
              <ElevationProfile
                corridor={corridor}
                rainBands={rainBands}
                placed={corridorAlerts}
                hiddenIds={hiddenIds}
                activeKm={tourKm}
                selectedId={selected?.id ?? null}
                onHoverKm={setProfileKm}
                onPickKm={(km) => mapRef.current?.flyToKm(km)}
                onSelectAlert={select}
              />
            </div>
          </div>
          <EventList
            alerts={filtered}
            hiddenIds={hiddenIds}
            selectedId={selected?.id ?? null}
            hoveredId={hoveredId}
            now={now}
            loading={loading}
            emptyReason={emptyReason}
            onSelect={select}
            onHover={setHoveredId}
            onClearFilters={clearFilters}
          />
        </div>
      </main>
    </div>
  );
}
