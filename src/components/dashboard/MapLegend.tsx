"use client";

import { useState } from "react";

import { CAUSE_META, STATUS_META } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { AlertCause } from "@/contracts/road-alerts";

import { CONDITION_COLORS, type LayerState } from "./types";

const LEGEND_CAUSES: AlertCause[] = ["fenomenos_naturales", "accidentes", "infraestructura", "humano"];

export function MapLegend({ layers }: { layers: LayerState }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="pr-legend pr-legend--compact" aria-label="Leyenda del mapa">
      <div className="pr-legend__compact-bar">
        <span className="pr-legend__item pr-legend__item--interrupted">
          <span className="pr-legend__dot" style={{ background: STATUS_META.interrumpido.color, color: STATUS_META.interrumpido.ink }}>
            <Icon name="interrumpido" size={8} strokeWidth={2.8} />
          </span>
          <span className="pr-legend__text">Interrumpido</span>
        </span>
        <span className="pr-legend__item pr-legend__item--restricted">
          <span className="pr-legend__dot" style={{ background: STATUS_META.restringido.color, color: STATUS_META.restringido.ink }}>
            <Icon name="restringido" size={8} strokeWidth={2.8} />
          </span>
          <span className="pr-legend__text">Restringido</span>
        </span>
        <span className="pr-legend__item pr-legend__item--passable">
          <span className="pr-legend__dot" style={{ background: STATUS_META.normal.color, color: STATUS_META.normal.ink }}>
            <Icon name="normal" size={8} strokeWidth={2.8} />
          </span>
          <span className="pr-legend__text">Transitable</span>
        </span>
        {layers.environment && (
          <span className="pr-legend__item">
            <span className="pr-evidence-key" />
            Referencia ambiental
          </span>
        )}
        <button
          type="button"
          className="pr-legend__expand-btn"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          title="Ver simbología completa de motivos y líneas"
        >
          <span>Simbología</span>
          <Icon name="chevronDown" size={11} />
        </button>
      </div>

      {expanded && (
        <div className="pr-legend__body">
          <div className="pr-legend__group">
            <span className="pr-legend__title">Icono · motivo del evento</span>
            {LEGEND_CAUSES.map((cause) => (
              <span key={cause} className="pr-legend__row">
                <Icon name={cause} size={13} />
                {CAUSE_META[cause].short}
              </span>
            ))}
          </div>
          {layers.corridor && (
            <div className="pr-legend__group pr-legend__group--wide">
              <span className="pr-legend__title">Corredor Carretera Central</span>
              <span className="pr-legend__row">
                <span className="pr-legend__line pr-legend__line--corridor" />
                Eje PE-22 (MTC)
              </span>
              <span className="pr-legend__row">
                <span className="pr-legend__line" style={{ background: STATUS_META.restringido.color }} />
                <span>
                  Tramo ilustrativo (±1,2 km) <span className="pr-muted">· aproximación visual</span>
                </span>
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
