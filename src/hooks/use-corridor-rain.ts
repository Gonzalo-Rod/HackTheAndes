"use client";

import { useEffect, useState } from "react";

import type { CorridorRainResponse } from "@/contracts/weather";
import { describeFetchError, fetchCorridorRain } from "@/integrations/dashboard-api/client";

/** The server caches the forecast for 30 min; the browser asks at the same pace. */
export const RAIN_POLL_INTERVAL_MS = 30 * 60_000;

export interface CorridorRainState {
  data: CorridorRainResponse | null;
  /** Last failure; previous data stays on screen. */
  error: string | null;
}

/** Rain sampled along the Carretera Central (Open-Meteo, via /api/weather/pe22). */
export function useCorridorRain(): CorridorRainState {
  const [state, setState] = useState<CorridorRainState>({ data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchCorridorRain().then(
        (data) => {
          if (!cancelled) setState({ data, error: null });
        },
        (failure: unknown) => {
          if (!cancelled) setState((previous) => ({ ...previous, error: describeFetchError(failure) }));
        },
      );
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, RAIN_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);
  return state;
}
