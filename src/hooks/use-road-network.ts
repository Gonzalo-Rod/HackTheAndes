"use client";
import { useEffect, useState } from "react";
import type { RoadNetwork } from "@/contracts/road-network";
import { fetchRoadNetwork } from "@/integrations/dashboard-api/client";

/** Loaded once, only when a huaico or landslide needs its roads highlighted; static file, no polling. */
export function useRoadNetwork(enabled: boolean) {
  const [network, setNetwork] = useState<RoadNetwork | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || network) return;
    let cancelled = false;
    fetchRoadNetwork().then(
      (data) => {
        if (!cancelled) setNetwork(data);
      },
      () => {
        if (!cancelled) setError("No se pudo cargar la red vial; las vías cercanas a huaicos no se resaltan.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, network]);
  return { network, error };
}
