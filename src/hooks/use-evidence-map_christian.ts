"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type { MapViewHandle } from "@/components/map/MapView";
import type { Scope } from "@/components/dashboard/types";
import type { EnvironmentalRecord, ResearchCatalog, ResearchTopic } from "@/contracts/research_christian";
import { groupEvidencePoints } from "@/domain/research/evidence-state_christian";
import { CENTRAL_VIEW_BOUNDS, evidenceBounds, inCentralView } from "@/domain/research/map-evidence_christian";

import { useResearchCatalog } from "./use-research-catalog_christian";

export function useEvidenceMap({
  initialData,
  mapRef,
  mapReady,
  onActivate,
  scope,
}: {
  initialData: ResearchCatalog | null;
  mapRef: RefObject<MapViewHandle | null>;
  mapReady: boolean;
  onActivate: () => void;
  scope: Scope;
}) {
  const state = useResearchCatalog(initialData);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topic, setTopic] = useState<ResearchTopic | null>(null);
  const allRecords = useMemo(() => state.data?.records ?? [], [state.data]);
  const records = useMemo(() => (scope === "pais" ? allRecords : allRecords.filter(inCentralView)), [allRecords, scope]);
  const filtered = useMemo(() => records.filter((record) => topic === null || record.topics.includes(topic)), [records, topic]);
  const points = useMemo(() => groupEvidencePoints(filtered), [filtered]);
  const areas = useMemo(() => filtered.filter((record) => record.geometry && record.geometry.type !== "Point"), [filtered]);
  const pendingFlight = useRef<string | null>(null);
  const center = useCallback(
    (record: EnvironmentalRecord) => {
      if (record.coordinates) mapRef.current?.flyToEvidence(record.coordinates);
      else {
        const bbox = evidenceBounds([record]);
        if (bbox) mapRef.current?.flyToBounds(bbox);
      }
    },
    [mapRef],
  );
  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      onActivate();
      window.history.replaceState(null, "", id ? `?evidencia=${encodeURIComponent(id)}` : window.location.pathname);
      const record = records.find((item) => item.id === id);
      if (record && mapReady) center(record);
      else pendingFlight.current = id;
    },
    [records, mapReady, center, onActivate],
  );
  const clearSelection = useCallback(() => {
    setSelectedId(null);
    pendingFlight.current = null;
  }, []);

  // Read browser state after hydration, so a shared evidence URL has the same
  // initial server/client markup and is centered only when the map is ready.
  const initialLinkRead = useRef(false);
  useEffect(() => {
    if (initialLinkRead.current) return;
    const timer = window.setTimeout(() => {
      initialLinkRead.current = true;
      const id = new URLSearchParams(window.location.search).get("evidencia");
      if (id) select(id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [select]);
  useEffect(() => {
    if (!mapReady || !pendingFlight.current) return;
    const record = records.find((item) => item.id === pendingFlight.current);
    if (!record) return;
    pendingFlight.current = null;
    center(record);
  }, [records, mapReady, center]);

  const fit = () => {
    const bbox = scope === "pe22" ? CENTRAL_VIEW_BOUNDS : evidenceBounds(filtered);
    onActivate();
    if (bbox) mapRef.current?.flyToBounds(bbox);
  };
  const changeTopic = (next: ResearchTopic | null) => {
    setTopic(next);
    select(null);
  };
  return { state, records, allRecords, points, areas, topic, selectedId, select, center, fit, clearSelection, changeTopic };
}
