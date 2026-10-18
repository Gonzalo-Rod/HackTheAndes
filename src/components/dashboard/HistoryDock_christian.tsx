"use client";

import { useState, type ComponentProps } from "react";

import { CauseStatusChart } from "@/components/charts/CauseStatusChart";
import { CumulativeChart } from "@/components/charts/CumulativeChart";
import { ElevationProfile } from "@/components/charts/ElevationProfile";
import { Icon } from "@/components/icons";

import { Timeline } from "./Timeline";

export function HistoryDock({
  timeline,
  cumulative,
  causes,
  profile,
}: {
  timeline: ComponentProps<typeof Timeline>;
  cumulative: ComponentProps<typeof CumulativeChart>;
  causes: ComponentProps<typeof CauseStatusChart>;
  profile: ComponentProps<typeof ElevationProfile>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`pr-dock${open ? " is-open" : " is-collapsed"}`}>
      <button
        type="button"
        className="pr-dock__toggle-bar"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Alternar panel de historial y tendencias"
      >
        <div className="pr-dock__toggle-left">
          <Icon name={open ? "chevronDown" : "chevronUp"} size={13} />
          <span className="pr-dock__toggle-title">Historial y tendencias</span>
          <span className="pr-dock__toggle-sub pr-hide-sm">Alertas viales vigentes por fecha de evento y perfil altimétrico</span>
        </div>
        <span className="pr-dock__toggle-action">{open ? "Ocultar panel ▼" : "Ver historial y tendencias ▲"}</span>
      </button>
      {open && (
        <div className="pr-dock__main">
          <Timeline {...timeline} />
          <div className="pr-charts">
            <CumulativeChart {...cumulative} />
            <CauseStatusChart {...causes} />
            <ElevationProfile {...profile} />
          </div>
        </div>
      )}
    </div>
  );
}
