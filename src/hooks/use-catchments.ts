"use client";
import { useEffect, useState } from "react";
import type { CatchmentLayer } from "@/contracts/catchments";
import { fetchCatchments } from "@/integrations/dashboard-api/client";
export function useCatchments() {
  const [data, setData] = useState<CatchmentLayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void fetchCatchments().then(
        (value) => {
          if (!cancelled) {
            setData(value);
            setError(null);
          }
        },
        () => {
          if (!cancelled) setError("Cuencas no disponibles; no implica ausencia de peligro.");
        },
      );
    load();
    const timer = window.setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  return { data, error };
}
