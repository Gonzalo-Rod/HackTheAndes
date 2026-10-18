"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CAUSE_ORDER } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { MapViewHandle } from "@/components/map/MapView";
import type { ResearchCatalog } from "@/contracts/research_christian";
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
import { inCentralView } from "@/domain/research/map-evidence_christian";
import { useAlertDetail } from "@/hooks/use-alert-detail";
import { useCorridorRain } from "@/hooks/use-corridor-rain";
import { useCorridor } from "@/hooks/use-corridor";
import { useNow } from "@/hooks/use-now";
import { useRoadAlerts } from "@/hooks/use-road-alerts";
import { useEvidenceMap } from "@/hooks/use-evidence-map_christian";
import { useTimelinePlayback } from "@/hooks/use-timeline-playback";

import { AlertDetail } from "./AlertDetail";
import { EventList } from "./EventList";
import { FilterBar } from "./FilterBar";
import { HistoryDock } from "./HistoryDock_christian";
import { LayersPanel } from "./LayersPanel";
import { MapArea } from "./MapArea";
import { Sidebar } from "./Sidebar";
import { SourcesPanel } from "./SourcesPanel";
import { ResearchPanel } from "./research/ResearchPanel_christian";
import { ResearchFilterBar } from "./research/ResearchFilterBar_christian";
import { TopBar } from "./TopBar";
import { DEFAULT_LAYERS, type MapMode, type Scope, type SidebarTab } from "./types";

const PE22 = "PE-22";
const EMPTY_SET: ReadonlySet<string> = new Set();
/** Padding (degrees) around a region's alerts when the map flies to them. */
const REGION_FIT_PADDING_DEG = 0.6;

const readDeepLink = () => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("alerta"));

export function Dashboard({ initialResearch = null }: { initialResearch?: ResearchCatalog | null }) {
  const alertsState = useRoadAlerts();
  const corridorState = useCorridor();
  const rainState = useCorridorRain();
  const now = useNow();
  const mapRef = useRef<MapViewHandle>(null);
  const [mapReady, setMapReady] = useState(false);

  const [scope, setScope] = useState<Scope>("pais");
  const [filters, setFilters] = useState<AlertFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [mode, setMode] = useState<MapMode>("3d");
  const [tabChoice, setTabChoice] = useState<SidebarTab | null>(null); // null = automatic
  const [range, setRange] = useState<TimelineRange>("30d");
  const [cursorMs, setCursorMs] = useState<number | null>(null); // null = today
  const [profileKm, setProfileKm] = useState<number | null>(null);
  const [tourKm, setTourKm] = useState<number | null>(null);
  const [detailReload, setDetailReload] = useState(0);

  const activateResearch = useCallback(() => {
    setSelectedId(null);
    setTabChoice("ambiente");
    setLayers((current) => ({ ...current, environment: true }));
  }, []);
  const {
    state: researchState,
    records: evidenceRecords,
    allRecords: allEvidenceRecords,
    points: evidencePoints,
    areas: evidenceAreas,
    topic: researchTopic,
    selectedId: selectedEvidenceId,
    select: selectEvidence,
    center: centerEvidence,
    fit: fitEvidence,
    clearSelection: clearEvidenceSelection,
    changeTopic,
  } = useEvidenceMap({ initialData: initialResearch, mapRef, mapReady, onActivate: activateResearch, scope });

  const corridor = corridorState.status === "ready" ? corridorState.data : null;
  const allAlerts = useMemo(() => alertsState.data?.alerts ?? [], [alertsState.data]);
  const scopedFilters = useMemo(() => ({ ...filters, roadCode: scope === "pe22" ? PE22 : null }), [filters, scope]);
  const filtered = useMemo(() => sortByRecentAction(filterAlerts(allAlerts, scopedFilters)), [allAlerts, scopedFilters]);
  const facets = useMemo(() => facetCounts(allAlerts, scopedFilters), [allAlerts, scopedFilters]);
  const regions = useMemo(() => regionOptions(allAlerts), [allAlerts]);
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
  const tab: SidebarTab = tabChoice ?? (selected ? "detalle" : "ambiente");
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
      clearEvidenceSelection();
      setTabChoice((choice) => (id ? null : choice === "detalle" || selectedId ? "alertas" : choice));
      window.history.replaceState(null, "", id ? `?alerta=${encodeURIComponent(id)}` : window.location.pathname);
      const alert = id ? allAlerts.find((a) => a.id === id) : undefined;
      if (alert) mapRef.current?.flyToAlert(alert);
    },
    [allAlerts, selectedId, clearEvidenceSelection],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setSelectedId(readDeepLink()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Fly to a deep-linked alert once its data has arrived (the camera ignores calls before the map loads).
  const deepLinkHandled = useRef(readDeepLink() === null);
  useEffect(() => {
    if (deepLinkHandled.current || !selected || !mapReady) return;
    deepLinkHandled.current = true;
    mapRef.current?.flyToAlert(selected);
  }, [selected, mapReady]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      mapRef.current?.stopTour();
      setSelectedId(null);
      clearEvidenceSelection();
      setTabChoice(null);
      window.history.replaceState(null, "", window.location.pathname);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [clearEvidenceSelection]);

  const changeScope = (next: Scope) => {
    setScope(next);
    setSelectedId(null);
    clearEvidenceSelection();
    window.history.replaceState(null, "", window.location.pathname);
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
        scope={scope}
        counts={{
          pais: { roads: allAlerts.length, environment: allEvidenceRecords.length },
          pe22: { roads: pe22Count, environment: allEvidenceRecords.filter(inCentralView).length },
        }}
        meta={alertsState.data?.meta ?? null}
        loading={loading}
        refreshing={alertsState.refreshing}
        error={alertsState.error}
        now={now}
        onScopeChange={changeScope}
        onRefresh={alertsState.refresh}
      />
      {tab === "ambiente" ? (
        <ResearchFilterBar records={evidenceRecords} topic={researchTopic} onTopicChange={changeTopic} onFit={fitEvidence} />
      ) : (
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
      )}

      <main className="pr-main">
        <MapArea
          mapRef={mapRef}
          handle={() => mapRef.current}
          alerts={filtered}
          evidence={evidencePoints}
          evidenceAreas={evidenceAreas}
          selectedEvidenceId={selectedEvidenceId}
          initialScope={scope}
          onSelectEvidence={selectEvidence}
          onMapReady={() => setMapReady(true)}
          hiddenIds={hiddenIds}
          hoveredId={hoveredId}
          selected={selected}
          layers={layers}
          mode={mode}
          corridor={corridor}
          corridorAlerts={corridorAlerts}
          rainSegments={rainBands}
          highlightRegionKey={filters.regionKey}
          profileKm={tourKm ?? profileKm}
          now={now}
          status={{
            loading,
            dataError: alertsState.status === "error" ? alertsState.error : null,
            staleMessage: alertsState.data && alertsState.error ? alertsState.error : null,
            refreshing: alertsState.refreshing,
            partialData: evidenceRecords.length > 0,
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
          alertsCount={filtered.length}
          hasSelection={selected !== null}
          onTabChange={(next) => (next === "ambiente" ? activateResearch() : setTabChoice(next))}
          eventsContent={
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
          }
          environmentContent={
            <ResearchPanel
              key={researchTopic ?? "all"}
              state={researchState}
              records={evidenceRecords}
              coverage={scope === "pais" ? "Todo el Perú · fuentes oficiales" : "PE-22 y entorno del Mantaro · ventana de consulta"}
              now={now}
              topic={researchTopic}
              selectedId={selectedEvidenceId}
              onSelect={selectEvidence}
              onCenter={centerEvidence}
              liveSources={<SourcesPanel meta={alertsState.data?.meta ?? null} corridor={corridor} rain={rain} />}
            />
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
                <p>Selecciona una alerta en el mapa o en la lista de avisos para consultar su detalle e historial.</p>
              </div>
            )
          }
          layersContent={
            <section className="pr-panel" aria-labelledby="layers-title">
              <header className="pr-panel__head">
                <h2 id="layers-title">Capas y visualización 3D</h2>
              </header>
              <LayersPanel
                layers={layers}
                is3d={mode === "3d"}
                meta={alertsState.data?.meta ?? null}
                corridor={corridor}
                rain={rain}
                rainError={rainState.error}
                environmentalCount={evidenceRecords.length}
                environmentalRetrievedAt={researchState.data?.retrievedAt ?? null}
                now={now}
                onChange={setLayers}
              />
            </section>
          }
        />

        <HistoryDock
          timeline={{
            alerts: filtered,
            window: timeWindow,
            range,
            cursorMs,
            playing: playback.playing,
            earlierCount: countBefore(filtered, timeWindow.startMs),
            selectedId: selected?.id ?? null,
            onRangeChange: setRange,
            onCursorChange: (ms) => {
              playback.stop();
              setCursorMs(ms);
            },
            onTogglePlay: playback.toggle,
            onStep: stepTimeline,
            onSelect: select,
            onHover: setHoveredId,
          }}
          cumulative={{ points: cumulative, window: timeWindow, cursorMs, onPickDay: setCursorMs }}
          causes={{
            rows: matrix,
            activeCauses: filters.causes,
            onToggleCause: (cause) => setFilters({ ...filters, causes: toggleValue(filters.causes, cause) }),
          }}
          profile={{
            corridor,
            rainBands,
            placed: corridorAlerts,
            hiddenIds,
            activeKm: tourKm,
            selectedId: selected?.id ?? null,
            onHoverKm: setProfileKm,
            onPickKm: (km) => mapRef.current?.flyToKm(km),
            onSelectAlert: select,
          }}
        />
      </main>
    </div>
  );
}
