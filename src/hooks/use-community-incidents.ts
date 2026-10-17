"use client";
import { useEffect, useState } from "react";
import type { RoadAlert } from "@/contracts/road-alerts";
import { fetchCommunityIncidents } from "@/integrations/dashboard-api/client";
import { subscribeToIncidentChanges, type RealtimeState } from "@/integrations/realtime/incidents";

// The periodic refresh remains active when Realtime is disabled or disconnected.
const COMMUNITY_POLL_MS = 60_000;
export function useCommunityIncidents() {
  const [alerts, setAlerts] = useState<RoadAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<RealtimeState>("connecting");
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => Promise<void>) | undefined;
    let running = false;
    async function load() {
      if (running || cancelled) return;
      running = true;
      try {
        const feed = await fetchCommunityIncidents();
        if (!cancelled) {
          setAlerts(feed.alerts);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Reportes comunitarios no disponibles; los datos anteriores pueden estar desactualizados.");
      } finally {
        running = false;
      }
    }
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, COMMUNITY_POLL_MS);
    void subscribeToIncidentChanges(
      () => void load(),
      (state) => {
        if (!cancelled) setConnection(state);
      },
    ).then(
      (stop) => {
        if (cancelled) void stop();
        else unsubscribe = stop;
      },
      () => {
        if (!cancelled) setConnection("polling");
      },
    );
    return () => {
      cancelled = true;
      void unsubscribe?.();
      window.clearInterval(timer);
      window.clearTimeout(initial);
    };
  }, []);
  return { alerts, error, connection };
}
