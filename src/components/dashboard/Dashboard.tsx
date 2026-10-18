"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/icons";
import type { MapViewHandle } from "@/components/map/MapView";
import type { ResearchCatalog } from "@/contracts/research_christian";
import { formatForecastWindow, type ForecastEvent } from "@/domain/exposure/forecast-events";
import { forecastSupport } from "@/domain/exposure/forecast-support";
import { inCentralView } from "@/domain/research/map-evidence_christian";
import { countBefore } from "@/domain/road-alerts/timeline";
import { toggleValue } from "@/domain/road-alerts/filters";
import { useCatchments } from "@/hooks/use-catchments";
import { useClimateForecast } from "@/hooks/use-climate-forecast";
import { useCommunityIncidents } from "@/hooks/use-community-incidents";
import { useCorridor } from "@/hooks/use-corridor";
import { useCorridorRain } from "@/hooks/use-corridor-rain";
import { useEvidenceMap } from "@/hooks/use-evidence-map_christian";
import { useIncidentDashboard } from "@/hooks/use-incident-dashboard";
import { useModelInputs } from "@/hooks/use-model-inputs";
import { useNow } from "@/hooks/use-now";
import { useRoadAlerts } from "@/hooks/use-road-alerts";

import { AlertDetail } from "./AlertDetail";
import { ClimateForecastPanel } from "./ClimateForecastPanel";
import { EventList } from "./EventList";
import { FilterBar } from "./FilterBar";
import { HistoryDock } from "./HistoryDock_christian";
import { LayersPanel } from "./LayersPanel";
import { MapArea } from "./MapArea";
import { ResearchFilterBar } from "./research/ResearchFilterBar_christian";
import { ResearchPanel } from "./research/ResearchPanel_christian";
import { Sidebar } from "./Sidebar";
import { SourcesPanel } from "./SourcesPanel";
import { TopBar } from "./TopBar";
import { DEFAULT_LAYERS, type MapMode, type Scope, type SidebarTab } from "./types";

export function Dashboard({ initialResearch = null }: { initialResearch?: ResearchCatalog | null }) {
  const alertsState = useRoadAlerts();
  const community = useCommunityIncidents();
  const corridorState = useCorridor();
  const rainState = useCorridorRain();
  const catchments = useCatchments();
  const modelInputs = useModelInputs();
  const now = useNow();
  const forecast = useClimateForecast(now);
  const mapRef = useRef<MapViewHandle>(null);
  const [mapReady, setMapReady] = useState(false);

  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [mode, setMode] = useState<MapMode>("3d");
  const [tabChoice, setTabChoice] = useState<SidebarTab | null>(null); // null = automatic
  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("vista");
    if (view !== "pronostico" && view !== "ambiente") return;
    const timer = window.setTimeout(() => setTabChoice(view), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const corridor = corridorState.status === "ready" ? corridorState.data : null;
  const allAlerts = useMemo(() => [...(alertsState.data?.alerts ?? []), ...community.alerts], [alertsState.data, community.alerts]);
  const rain = rainState.data;
  const incident = useIncidentDashboard({ allAlerts, corridor, rain, now, mapRef });
  const { scope, filters, selected, filtered, filtersActive, pe22Count, hiddenIds, timeWindow, setSelectedId } = incident;

  const activateResearch = useCallback(() => {
    setSelectedId(null);
    setTabChoice("ambiente");
    setLayers((current) => ({ ...current, environment: true }));
  }, [setSelectedId]);
  const evidence = useEvidenceMap({ initialData: initialResearch, mapRef, mapReady, onActivate: activateResearch, scope });
  const { clearSelection: clearEvidenceSelection } = evidence;

  const { select: selectIncident } = incident;
  const { select: selectForecast } = forecast;
  const tab: SidebarTab = tabChoice ?? (selected ? "detalle" : "pronostico");
  const select = useCallback(
    (id: string | null) => {
      selectIncident(id);
      selectForecast(null);
      clearEvidenceSelection();
      setTabChoice((choice) => (id ? null : choice === "detalle" ? "alertas" : choice));
    },
    [selectIncident, selectForecast, clearEvidenceSelection],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      mapRef.current?.stopTour();
      select(null);
      setTabChoice(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [select]);

  const changeScope = (next: Scope) => {
    select(null);
    incident.changeScope(next);
  };

  const focusForecast = (event: ForecastEvent) => {
    forecast.select(event.id);
    setSelectedId(null);
    setTabChoice("pronostico");
    setLayers((previous) => ({ ...previous, exposure: true }));
    const bounds = forecast.map.bounds[event.id];
    if (bounds) mapRef.current?.flyToBounds(bounds);
  };

  const evidenceRecords = evidence.state.data ? evidence.allRecords : null;
  const support = useMemo(
    () => (forecast.window ? forecastSupport(forecast.window, evidenceRecords) : null),
    [forecast.window, evidenceRecords],
  );

  const loading = alertsState.status === "loading";
  const emptyReason = loading || filtered.length ? null : filtersActive ? "filters" : "none";
  const sources = (
    <SourcesPanel
      meta={alertsState.data?.meta ?? null}
      corridor={corridor}
      rain={rain}
      hazards={modelInputs.hazards.data}
      catchmentWeather={modelInputs.weather.data}
    />
  );

  return (
    <div className="pr-app">
      <TopBar
        communityStatus={community.error ?? (community.connection === "live" ? "Comunidad · en vivo" : "Comunidad · consulta cada minuto")}
        scope={scope}
        counts={{
          pais: { roads: allAlerts.length, environment: evidence.allRecords.length },
          pe22: { roads: pe22Count, environment: evidence.allRecords.filter(inCentralView).length },
        }}
        meta={alertsState.data?.meta ?? null}
        loading={loading}
        refreshing={alertsState.refreshing}
        error={alertsState.error}
        now={now}
        onScopeChange={changeScope}
        onRefresh={alertsState.refresh}
        onOpenSources={activateResearch}
      />
      {tab === "ambiente" ? (
        <ResearchFilterBar records={evidence.records} topic={evidence.topic} onTopicChange={evidence.changeTopic} onFit={evidence.fit} />
      ) : (
        <FilterBar
          filters={filters}
          facets={incident.facets}
          regions={incident.regions}
          resultCount={filtered.length}
          totalCount={scope === "pe22" ? pe22Count : allAlerts.length}
          active={filtersActive}
          onChange={incident.changeFilters}
          onClear={incident.clearFilters}
        />
      )}

      <main className="pr-main">
        <MapArea
          mapRef={mapRef}
          handle={() => mapRef.current}
          alerts={filtered}
          evidence={evidence.points}
          evidenceAreas={evidence.areas}
          selectedEvidenceId={evidence.selectedId}
          initialScope={scope}
          onSelectEvidence={evidence.select}
          onMapReady={() => setMapReady(true)}
          hiddenIds={hiddenIds}
          hoveredId={incident.hoveredId}
          selected={selected}
          layers={layers}
          mode={mode}
          corridor={corridor}
          corridorAlerts={incident.corridorAlerts}
          rainSegments={incident.rainBands}
          catchments={catchments.data}
          hazards={modelInputs.hazards.data}
          forecastData={forecast.map.data}
          forecastLabel={forecast.window ? formatForecastWindow(forecast.window) : null}
          onForecastOpen={() => setTabChoice("pronostico")}
          selectedForecastId={forecast.selected?.id ?? null}
          onForecastSelect={(id) => {
            forecast.select(id);
            setTabChoice("pronostico");
          }}
          highlightRegionKey={filters.regionKey}
          profileKm={incident.tourKm ?? incident.profileKm}
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
                evidence.state.error,
                modelInputs.weather.data?.meta.stale ? "Lluvia por cuenca en caché; revisar la fecha del pronóstico." : null,
                modelInputs.hazards.data?.meta.stale ? "Avisos oficiales en caché; revisar su vigencia." : null,
                catchments.data?.meta.state === "snapshot" ? catchments.data.meta.message : null,
              ]
                .filter(Boolean)
                .join(" ") || null,
            refreshing: alertsState.refreshing,
            partialData: evidence.records.length > 0,
            onRetry: alertsState.refresh,
          }}
          onSelect={select}
          onHover={incident.setHoveredId}
          onLayersChange={setLayers}
          onModeChange={setMode}
          onOpenDetail={() => setTabChoice("detalle")}
          onTourKm={incident.setTourKm}
        />

        <Sidebar
          tab={tab}
          alertsCount={filtered.length}
          hasSelection={selected !== null}
          onTabChange={(next) => (next === "ambiente" ? activateResearch() : setTabChoice(next))}
          forecastContent={
            <ClimateForecastPanel
              forecast={forecast}
              visible={layers.exposure}
              onToggle={() => setLayers((previous) => ({ ...previous, exposure: !previous.exposure }))}
              onFocus={focusForecast}
              support={support}
              onOpenNotice={evidence.select}
            />
          }
          eventsContent={
            <EventList
              alerts={filtered}
              hiddenIds={hiddenIds}
              selectedId={selected?.id ?? null}
              hoveredId={incident.hoveredId}
              now={now}
              loading={loading}
              emptyReason={emptyReason}
              onSelect={select}
              onHover={incident.setHoveredId}
              onClearFilters={incident.clearFilters}
            />
          }
          environmentContent={
            <ResearchPanel
              key={evidence.topic ?? "all"}
              state={evidence.state}
              records={evidence.records}
              coverage={scope === "pais" ? "Todo el Perú · fuentes oficiales" : "PE-22 y entorno del Mantaro · ventana de consulta"}
              now={now}
              topic={evidence.topic}
              selectedId={evidence.selectedId}
              onSelect={evidence.select}
              onCenter={evidence.center}
              liveSources={sources}
            />
          }
          detailContent={
            selected ? (
              <AlertDetail
                alert={selected}
                detail={incident.detail}
                corridorContext={incident.corridorContext}
                roadAlertCount={incident.roadCounts.get(selected.roadCode) ?? 0}
                now={now}
                onRetryDetail={() => incident.setDetailReload((n) => n + 1)}
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
                environmentalCount={evidence.records.length}
                environmentalRetrievedAt={evidence.state.data?.retrievedAt ?? null}
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
            range: incident.range,
            cursorMs: incident.cursorMs,
            playing: incident.playback.playing,
            earlierCount: countBefore(filtered, timeWindow.startMs),
            selectedId: selected?.id ?? null,
            onRangeChange: incident.setRange,
            onCursorChange: (ms) => {
              incident.playback.stop();
              incident.setCursorMs(ms);
            },
            onTogglePlay: incident.playback.toggle,
            onStep: incident.stepTimeline,
            onSelect: select,
            onHover: incident.setHoveredId,
          }}
          cumulative={{ points: incident.cumulative, window: timeWindow, cursorMs: incident.cursorMs, onPickDay: incident.setCursorMs }}
          causes={{
            rows: incident.matrix,
            activeCauses: filters.causes,
            onToggleCause: (cause) => incident.setFilters({ ...filters, causes: toggleValue(filters.causes, cause) }),
          }}
          profile={{
            corridor,
            rainBands: incident.rainBands,
            placed: incident.corridorAlerts,
            hiddenIds,
            activeKm: incident.tourKm,
            selectedId: selected?.id ?? null,
            onHoverKm: incident.setProfileKm,
            onPickKm: (km) => mapRef.current?.flyToKm(km),
            onSelectAlert: select,
          }}
        />
      </main>
    </div>
  );
}
