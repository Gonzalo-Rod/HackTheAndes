"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExposureLayer } from "@/contracts/exposure";
import type { SegmentCollection } from "@/contracts/platform";
import { fetchExposure, fetchSegments } from "@/integrations/dashboard-api/client";
import { chooseForecastWindow, projectForecastEvents } from "@/domain/exposure/forecast-events";
import { projectForecastMap } from "@/domain/exposure/forecast-map";
/** Refresh more often than hourly ingestion so a new assessment becomes visible without reloading. */
const REFRESH_INTERVAL_MS = 5 * 60_000;
export function useClimateForecast(nowMs: number | null) {
  const [view, setView] = useState<ExposureLayer | null>(null);
  const [segments, setSegments] = useState<SegmentCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [horizonHours, setHorizonHours] = useState<24 | 72>(24);
  const [windowId, setWindowId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false,
      running = false;
    async function load() {
      if (running || cancelled) return;
      running = true;
      const [assessment, geometry] = await Promise.allSettled([fetchExposure(), fetchSegments()]);
      running = false;
      if (cancelled) return;
      if (assessment.status === "fulfilled") setView(assessment.value);
      if (geometry.status === "fulfilled") setSegments(geometry.value);
      setError(
        assessment.status === "rejected"
          ? "No se pudo actualizar la evaluación; revisa la fecha de los datos guardados."
          : geometry.status === "rejected"
            ? "No se pudo actualizar la geometría del pronóstico."
            : null,
      );
      setLoading(false);
    }
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [reload]);
  const projection = useMemo(() => projectForecastEvents(view, nowMs ?? 0, horizonHours), [view, nowMs, horizonHours]);
  const activeWindow = useMemo(() => chooseForecastWindow(projection, windowId), [projection, windowId]);
  const map = useMemo(() => projectForecastMap(view, segments, activeWindow), [view, segments, activeWindow]);
  const selected = activeWindow?.events.find((event) => event.id === eventId) ?? null;
  return {
    view,
    projection,
    window: activeWindow,
    map,
    selected,
    loading,
    error,
    horizonHours,
    setHorizonHours,
    setWindowId,
    select: setEventId,
    refresh: useCallback(() => setReload((value) => value + 1), []),
  };
}
export type ClimateForecastState = ReturnType<typeof useClimateForecast>;
