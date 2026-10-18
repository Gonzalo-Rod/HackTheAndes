"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExposureLayer } from "@/contracts/exposure";
import type { ForecastRoad } from "@/contracts/forecast-roads";
import type { SegmentCollection } from "@/contracts/platform";
import { fetchExposure, fetchForecastRoads, fetchSegments } from "@/integrations/dashboard-api/client";
import { chooseForecastWindow, projectForecastEvents, type ForecastProjection } from "@/domain/exposure/forecast-events";
import { projectForecastMap } from "@/domain/exposure/forecast-map";
import { readDashboardRoad, sameRoadCode } from "@/domain/messaging/dashboard-links";
import { mergeForecastMaps, mergeForecastProjections, type NationalForecastProjection } from "@/domain/exposure/forecast-national";
/** Refresh more often than hourly ingestion so a new assessment becomes visible without reloading. */
const REFRESH_INTERVAL_MS = 5 * 60_000;

interface RoadState {
  view: ExposureLayer | null;
  segments: SegmentCollection | null;
  error: string | null;
}

async function loadRoad(roadCode: string, previous: RoadState | undefined): Promise<RoadState> {
  const [assessment, geometry] = await Promise.allSettled([fetchExposure(roadCode), fetchSegments(roadCode)]);
  return {
    // A failed refresh keeps the last good data; its age check still hides it once stale.
    view: assessment.status === "fulfilled" ? assessment.value : (previous?.view ?? null),
    segments: geometry.status === "fulfilled" ? geometry.value : (previous?.segments ?? null),
    error:
      assessment.status === "rejected"
        ? `${roadCode}: no se pudo actualizar la evaluación.`
        : geometry.status === "rejected"
          ? `${roadCode}: geometría del pronóstico no disponible.`
          : null,
  };
}

export function useClimateForecast(nowMs: number | null) {
  const [roads, setRoads] = useState<ForecastRoad[]>([]);
  const [states, setStates] = useState<Record<string, RoadState>>({});
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [horizonHours, setHorizonHours] = useState<24 | 72>(24);
  const [roadFilter, setRoadFilter] = useState<string | null>(null);
  const [windowId, setWindowId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false,
      running = false;
    let known: ForecastRoad[] = [];
    let latest: Record<string, RoadState> = {};
    async function load() {
      if (running || cancelled) return;
      running = true;
      try {
        known = (await fetchForecastRoads()).roads;
        if (!cancelled) {
          setRoads(known);
          setListError(null);
        }
      } catch {
        // The last known list keeps working; the panel says the road list could not refresh.
        if (!cancelled) setListError("No se pudo actualizar la lista de carreteras con estimación.");
      }
      const entries = await Promise.all(
        known.map(async (road) => [road.roadCode, await loadRoad(road.roadCode, latest[road.roadCode])] as const),
      );
      running = false;
      if (cancelled) return;
      latest = Object.fromEntries(entries);
      setStates(latest);
      setLoading(false);
    }
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [reload]);

  // A WhatsApp `?carretera=` link preselects that road once the registry list arrives, using the
  // registry spelling (PE-08B) even when the link was typed as PE-8B.
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    const road = readDashboardRoad(window.location.search);
    const match = road ? roads.find((item) => sameRoadCode(item.roadCode, road)) : undefined;
    if (!match) return;
    // Applied once, so a later list refresh never overrides the user's own road choice.
    const timer = window.setTimeout(() => {
      deepLinkApplied.current = true;
      setRoadFilter(match.roadCode);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [roads]);

  const perRoad = useMemo(
    () =>
      roads.map((road) => ({
        road,
        state: states[road.roadCode],
        projection: projectForecastEvents(states[road.roadCode]?.view ?? null, nowMs ?? 0, horizonHours),
      })),
    [roads, states, nowMs, horizonHours],
  );
  const national = useMemo<NationalForecastProjection>(
    () => mergeForecastProjections(perRoad.map(({ road, projection }) => ({ roadCode: road.roadCode, projection }))),
    [perRoad],
  );
  // A road filter uses that road's own projection, so its segment counts stay its own.
  const projection: ForecastProjection = useMemo(
    () => perRoad.find(({ road }) => road.roadCode === roadFilter)?.projection ?? national,
    [perRoad, roadFilter, national],
  );
  const activeWindow = useMemo(() => chooseForecastWindow(projection, windowId), [projection, windowId]);
  const map = useMemo(
    () =>
      mergeForecastMaps(
        perRoad
          .filter(({ road }) => !roadFilter || road.roadCode === roadFilter)
          // Exact window only: a road without this window draws nothing rather than another period.
          .map(({ state, projection: own }) =>
            projectForecastMap(
              state?.view ?? null,
              state?.segments ?? null,
              own.windows.find((window) => window.id === activeWindow?.id) ?? null,
            ),
          ),
      ),
    [perRoad, roadFilter, activeWindow],
  );
  const selected = activeWindow?.events.find((event) => event.id === eventId) ?? null;
  const errors = [listError, ...perRoad.map(({ state }) => state?.error ?? null)].filter((value) => value !== null);
  return {
    roads,
    coverage: national.coverage,
    views: Object.fromEntries(perRoad.map(({ road, state }) => [road.roadCode, state?.view ?? null])),
    projection,
    window: activeWindow,
    map,
    selected,
    loading,
    error: errors.length ? errors.join(" ") : null,
    horizonHours,
    setHorizonHours,
    roadFilter,
    setRoadFilter,
    setWindowId,
    select: setEventId,
    refresh: useCallback(() => setReload((value) => value + 1), []),
  };
}
export type ClimateForecastState = ReturnType<typeof useClimateForecast>;
