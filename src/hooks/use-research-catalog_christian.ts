"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ResearchCatalog } from "@/contracts/research_christian";
import { describeFetchError } from "@/integrations/dashboard-api/client";
import { fetchResearchCatalog } from "@/integrations/dashboard-api/research-client_christian";

/** Archive refresh, independent from SUTRAN's two-minute live polling. */
const RESEARCH_REFRESH_MS = 5 * 60_000;

export function useResearchCatalog(initialData: ResearchCatalog | null = null) {
  const [data, setData] = useState<ResearchCatalog | null>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      setData(await fetchResearchCatalog());
      setError(null);
    } catch (failure) {
      setError(`No se pudo actualizar la investigación. ${describeFetchError(failure)}`);
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    const initial = initialData === null ? window.setTimeout(() => void load(), 0) : null;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, RESEARCH_REFRESH_MS);
    return () => {
      if (initial !== null) window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load, initialData]);
  return { data, error, refreshing, refresh: load };
}

export type ResearchCatalogState = ReturnType<typeof useResearchCatalog>;
