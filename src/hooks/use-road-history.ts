"use client";
import { useEffect, useState } from "react";
import type { RoadHistoryResponse } from "@/contracts/road-history";
import { fetchRoadHistory } from "@/integrations/dashboard-api/client";

// The capture is a dated export, so one load per session is enough; no polling.
export function useRoadHistory() {
  const [state, setState] = useState<{ data: RoadHistoryResponse | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    fetchRoadHistory().then(
      (data) => {
        if (!cancelled) setState({ data, error: null });
      },
      () => {
        if (!cancelled)
          setState({ data: null, error: "Historial de emergencias no disponible; no implica que la vía no tenga antecedentes." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
