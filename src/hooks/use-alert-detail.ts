"use client";

import { useEffect, useState } from "react";

import type { AlertDetailResponse } from "@/contracts/road-alerts";
import { describeFetchError, fetchAlertDetail } from "@/integrations/dashboard-api/client";

type DetailState =
  | { status: "idle" }
  | { status: "loading"; id: string }
  | { status: "ready"; id: string; data: AlertDetailResponse }
  | { status: "error"; id: string; message: string };

/** Loads sub-cause, evidence and history for the selected alert; `reloadKey` retries. */
export function useAlertDetail(id: string | null, reloadKey: number): DetailState {
  const [state, setState] = useState<DetailState>({ status: "idle" });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const start = window.setTimeout(() => setState({ status: "loading", id }), 0);
    fetchAlertDetail(id).then(
      (data) => {
        if (!cancelled) setState({ status: "ready", id, data });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: "error", id, message: describeFetchError(error) });
      },
    );
    return () => {
      cancelled = true;
      window.clearTimeout(start);
    };
  }, [id, reloadKey]);

  if (!id) return { status: "idle" };
  return "id" in state && state.id === id ? state : { status: "loading", id };
}
