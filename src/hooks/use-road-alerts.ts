"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AlertsResponse } from "@/contracts/road-alerts";
import { describeFetchError, fetchRoadAlerts } from "@/integrations/dashboard-api/client";

/** The server caches SUTRAN for 60 s; polling every 2 min keeps the view fresh without load. */
export const ALERTS_POLL_INTERVAL_MS = 120_000;

export interface RoadAlertsState {
  data: AlertsResponse | null;
  status: "loading" | "ready" | "error";
  refreshing: boolean;
  /** Last failure, shown even while previous data stays on screen. */
  error: string | null;
  lastAttemptAt: number | null;
  refresh: () => void;
}

export function useRoadAlerts(): RoadAlertsState {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [status, setStatus] = useState<RoadAlertsState["status"]>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAttemptAt, setLastAttemptAt] = useState<number | null>(null);
  const hasData = useRef(false);

  const load = useCallback(async (fresh: boolean) => {
    setRefreshing(true);
    try {
      const response = await fetchRoadAlerts({ fresh });
      hasData.current = true;
      setData(response);
      setStatus("ready");
      setError(response.meta.stale ? response.meta.staleReason : null);
    } catch (failure) {
      // Keep the previous data on screen; the error is shown next to it.
      setError(describeFetchError(failure));
      if (!hasData.current) setStatus("error");
    } finally {
      setRefreshing(false);
      setLastAttemptAt(Date.now());
    }
  }, []);

  useEffect(() => {
    // Polling is an external subscription; the first call starts the initial load.
    const initial = window.setTimeout(() => void load(false), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(false);
    }, ALERTS_POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  const refresh = useCallback(() => void load(true), [load]);
  return { data, status, refreshing, error, lastAttemptAt, refresh };
}
