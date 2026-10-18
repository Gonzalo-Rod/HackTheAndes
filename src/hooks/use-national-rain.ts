"use client";
import { useEffect, useState } from "react";
import type { NationalRainResponse } from "@/contracts/weather";
import { describeFetchError, fetchNationalRain } from "@/integrations/dashboard-api/client";

/** The server refreshes the national grid hourly; asking more often only returns its cache. */
const NATIONAL_RAIN_POLL_MS = 60 * 60_000;

export function useNationalRain() {
  const [state, setState] = useState<{ data: NationalRainResponse | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchNationalRain().then(
        (data) => {
          if (!cancelled) setState({ data, error: null });
        },
        (failure: unknown) => {
          if (!cancelled) setState((previous) => ({ ...previous, error: `Lluvia nacional: ${describeFetchError(failure)}` }));
        },
      );
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, NATIONAL_RAIN_POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);
  return state;
}
