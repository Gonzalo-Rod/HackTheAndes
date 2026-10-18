"use client";
import type { ComponentProps, RefObject } from "react";
import type { CorridorData } from "@/contracts/corridor";
import type { MapViewHandle } from "@/components/map/MapView";
import { CauseStatusChart } from "@/components/charts/CauseStatusChart";
import { CumulativeChart } from "@/components/charts/CumulativeChart";
import { ElevationProfile } from "@/components/charts/ElevationProfile";
import { countBefore } from "@/domain/road-alerts/timeline";
import { toggleValue } from "@/domain/road-alerts/filters";
import type { useIncidentDashboard } from "@/hooks/use-incident-dashboard";
import { EventList } from "./EventList";
import { Timeline } from "./Timeline";
interface Props {
  incident: ReturnType<typeof useIncidentDashboard>;
  corridor: CorridorData | null;
  mapRef: RefObject<MapViewHandle | null>;
  now: number | null;
  loading: boolean;
  emptyReason: ComponentProps<typeof EventList>["emptyReason"];
  onSelect: (id: string | null) => void;
}
export function DashboardObservedDock({ incident: i, corridor, mapRef, now, loading, emptyReason, onSelect }: Props) {
  return (
    <div className="pr-dock">
      <div className="pr-dock__main">
        <Timeline
          alerts={i.filtered}
          window={i.timeWindow}
          range={i.range}
          cursorMs={i.cursorMs}
          playing={i.playback.playing}
          earlierCount={countBefore(i.filtered, i.timeWindow.startMs)}
          selectedId={i.selected?.id ?? null}
          onRangeChange={i.setRange}
          onCursorChange={(ms) => {
            i.playback.stop();
            i.setCursorMs(ms);
          }}
          onTogglePlay={i.playback.toggle}
          onStep={i.stepTimeline}
          onSelect={onSelect}
          onHover={i.setHoveredId}
        />
        <div className="pr-charts">
          <CumulativeChart points={i.cumulative} window={i.timeWindow} cursorMs={i.cursorMs} onPickDay={i.setCursorMs} />
          <CauseStatusChart
            rows={i.matrix}
            activeCauses={i.filters.causes}
            onToggleCause={(cause) => i.setFilters({ ...i.filters, causes: toggleValue(i.filters.causes, cause) })}
          />
          <ElevationProfile
            corridor={corridor}
            rainBands={i.rainBands}
            placed={i.corridorAlerts}
            hiddenIds={i.hiddenIds}
            activeKm={i.tourKm}
            selectedId={i.selected?.id ?? null}
            onHoverKm={i.setProfileKm}
            onPickKm={(km) => mapRef.current?.flyToKm(km)}
            onSelectAlert={onSelect}
          />
        </div>
      </div>
      <EventList
        alerts={i.filtered}
        hiddenIds={i.hiddenIds}
        selectedId={i.selected?.id ?? null}
        hoveredId={i.hoveredId}
        now={now}
        loading={loading}
        emptyReason={emptyReason}
        onSelect={onSelect}
        onHover={i.setHoveredId}
        onClearFilters={i.clearFilters}
      />
    </div>
  );
}
