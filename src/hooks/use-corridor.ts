"use client";

import { useEffect, useState } from "react";

import type { CorridorData } from "@/contracts/corridor";
import { describeFetchError, fetchCorridor } from "@/integrations/dashboard-api/client";

export type CorridorState = { status: "loading" } | { status: "ready"; data: CorridorData } | { status: "error"; message: string };

/** Static PE-22 corridor layer (geometry, km markers, places, elevation profile). */
export function useCorridor(): CorridorState {
  const [state, setState] = useState<CorridorState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetchCorridor().then(
      (data) => {
        if (!cancelled) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: "error", message: describeFetchError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
