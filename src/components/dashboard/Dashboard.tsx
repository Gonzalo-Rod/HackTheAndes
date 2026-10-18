"use client";
import { useClimateForecast } from "@/hooks/use-climate-forecast";
import { ClimateForecastPanel } from "./ClimateForecastPanel";
import { formatForecastWindow } from "@/domain/exposure/forecast-events";
import type { ForecastEvent } from "@/domain/exposure/forecast-events";
import { useModelInputs } from "@/hooks/use-model-inputs";
import { useCatchments } from "@/hooks/use-catchments";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/icons";
import type { MapViewHandle } from "@/components/map/MapView";
import { DashboardObservedDock } from "./DashboardObservedDock";
import { useIncidentDashboard } from "@/hooks/use-incident-dashboard";
import { useCorridorRain } from "@/hooks/use-corridor-rain";
import { useCommunityIncidents } from "@/hooks/use-community-incidents";
import { useCorridor } from "@/hooks/use-corridor";
import { useNow } from "@/hooks/use-now";
import { useRoadAlerts } from "@/hooks/use-road-alerts";

import { AlertDetail } from "./AlertDetail";
import { FilterBar } from "./FilterBar";
import { LayersPanel } from "./LayersPanel";
import { MapArea } from "./MapArea";
import { Sidebar } from "./Sidebar";
import { SourcesPanel } from "./SourcesPanel";
import { SummaryPanel } from "./SummaryPanel";
import { TopBar } from "./TopBar";
import { DEFAULT_LAYERS, type MapMode, type SidebarTab } from "./types";

export function Dashboard() {
  const alertsState = useRoadAlerts();
  const community = useCommunityIncidents();
  const corridorState = useCorridor();
  const rainState = useCorridorRain();
  const catchments = useCatchments();
  const modelInputs = useModelInputs();
  const now = useNow();
  const forecast = useClimateForecast(now);
  const mapRef = useRef<MapViewHandle>(null);

  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [mode, setMode] = useState<MapMode>("3d");
  const [tabChoice, setTabChoice] = useState<SidebarTab | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("vista") !== "pronostico") return;
    const timer = window.setTimeout(() => setTabChoice("pronostico"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const corridor = corridorState.status === "ready" ? corridorState.data : null;
  const allAlerts = useMemo(() => [...(alertsState.data?.alerts ?? []), ...community.alerts], [alertsState.data, community.alerts]);
  const rain = rainState.data;
  const incident = useIncidentDashboard({ allAlerts, corridor, rain, now, mapRef });
  const {
    scope,
    filters,
    setSelectedId,
    hoveredId,
    setHoveredId,
    profileKm,
    tourKm,
    setTourKm,
    setDetailReload,
    filtered,
    facets,
    regions,
    summary,
    corridorAlerts,
    rainBands,
    hiddenIds,
    selected,
    detail,
    filtersActive,
    roadCounts,
    pe22Count,
    corridorContext,
    changeScope,
    changeFilters,
    clearFilters,
  } = incident;
  const { select: selectIncident } = incident;
  const { select: selectForecast } = forecast;
  const tab: SidebarTab = tabChoice ?? (selected ? "detalle" : "capas");
  const select = useCallback(
    (id: string | null) => {
      selectIncident(id);
      selectForecast(null);
      setTabChoice((previous) => (id === null && previous === "pronostico" ? previous : null));
    },
    [selectIncident, selectForecast],
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

  const focusForecast = (event: ForecastEvent) => {
    forecast.select(event.id);
    setSelectedId(null);
    setTabChoice("pronostico");
    setLayers((previous) => ({ ...previous, exposure: true }));
    const bounds = forecast.map.bounds[event.id];
    if (bounds) mapRef.current?.flyToBounds(bounds);
  };

  const loading = alertsState.status === "loading";
  const emptyReason = loading || filtered.length ? null : filtersActive ? "filters" : "none";

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
          forecastData={forecast.map.data}
          forecastLabel={forecast.window ? formatForecastWindow(forecast.window) : null}
          onForecastOpen={() => setTabChoice("pronostico")}
          selectedForecastId={forecast.selected?.id ?? null}
          onForecastSelect={(id) => {
            forecast.select(id);
            setTabChoice("pronostico");
          }}
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
              <button
                type="button"
                className="pr-forecast-entry"
                onClick={() => {
                  setTabChoice("pronostico");
                  mapRef.current?.flyToCorridor();
                }}
              >
                <strong>Posibles huaicos · estimación</strong>
                <span>Ver fechas y franjas →</span>
              </button>
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
          forecastContent={
            <ClimateForecastPanel
              forecast={forecast}
              visible={layers.exposure}
              onToggle={() => setLayers((previous) => ({ ...previous, exposure: !previous.exposure }))}
              onFocus={focusForecast}
            />
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

        <DashboardObservedDock
          incident={incident}
          corridor={corridor}
          mapRef={mapRef}
          now={now}
          loading={loading}
          emptyReason={emptyReason}
          onSelect={select}
        />
      </main>
    </div>
  );
}
