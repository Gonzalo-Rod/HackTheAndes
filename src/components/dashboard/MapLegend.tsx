"use client";

import { useState } from "react";

import { CAUSE_META, STATUS_META } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { AlertCause, RoadStatus } from "@/contracts/road-alerts";

import { CONDITION_COLORS, type LayerState } from "./types";

const LEGEND_STATUSES: RoadStatus[] = ["interrumpido", "restringido", "normal", "desconocido"];
const LEGEND_CAUSES: AlertCause[] = ["fenomenos_naturales", "accidentes", "infraestructura", "humano"];

export function MapLegend({ layers }: { layers: LayerState }) {
  // Open by default on wide screens; collapsed on phones, where it would cover the map.
  const compact = useMediaQuery("(max-width: 900px)");
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? !compact;
  const setOpen = (value: boolean) => setChoice(value);
  return (
    <section className={`pr-legend${open ? "" : " is-collapsed"}`} aria-label="Leyenda">
      <button type="button" className="pr-legend__toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        Leyenda
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className="pr-legend__body">
          <div className="pr-legend__group">
            <span className="pr-legend__title">Color · estado</span>
            {LEGEND_STATUSES.map((status) => (
              <span key={status} className="pr-legend__row">
                <span className="pr-legend__dot" style={{ background: STATUS_META[status].color, color: STATUS_META[status].ink }}>
                  <Icon name={status} size={9} strokeWidth={2.8} />
                </span>
                {STATUS_META[status].label}
              </span>
            ))}
          </div>
          <div className="pr-legend__group">
            <span className="pr-legend__title">Icono · motivo</span>
            {LEGEND_CAUSES.map((cause) => (
              <span key={cause} className="pr-legend__row">
                <Icon name={cause} size={13} />
                {CAUSE_META[cause].short}
              </span>
            ))}
          </div>
          {layers.corridor && (
            <div className="pr-legend__group pr-legend__group--wide">
              <span className="pr-legend__title">Carretera Central</span>
              <span className="pr-legend__row">
                <span className="pr-legend__line pr-legend__line--corridor" />
                Eje PE-22 (MTC)
              </span>
              <span className="pr-legend__row">
                <span className="pr-legend__line" style={{ background: STATUS_META.restringido.color }} />
                Tramo afectado (±1,2 km, aprox.)
              </span>
            </div>
          )}
          {layers.network && layers.networkColorBy === "condition" && (
            <div className="pr-legend__group pr-legend__group--wide">
              <span className="pr-legend__title">Red nacional · conservación</span>
              {Object.entries(CONDITION_COLORS).map(([label, color]) => (
                <span key={label} className="pr-legend__row">
                  <span className="pr-legend__line" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
