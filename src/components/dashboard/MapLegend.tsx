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
        <span className="pr-legend__item">
          <span className="pr-legend__dot" style={{ background: STATUS_META.desconocido.color, color: STATUS_META.desconocido.ink }}>
            <Icon name="desconocido" size={8} strokeWidth={2.8} />
          </span>
          <span className="pr-legend__text">Sin confirmar</span>
        </span>
        {layers.environment && (
          <span className="pr-legend__item">
            <span className="pr-evidence-key pr-evidence-key--reference">i</span>
            <span className="pr-evidence-key pr-evidence-key--critical">!</span>
            Clima y territorio
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
            <span className="pr-legend__title">Territorio</span>
            <span className="pr-legend__row">
              <span className="pr-legend__line" style={{ background: "#f6f0d7" }} />
              Límite nacional de Perú
            </span>
          </div>
          {layers.environment && (
            <div className="pr-legend__group pr-legend__group--wide">
              <span className="pr-legend__title">Clima y territorio · fuente verificada</span>
              <span className="pr-legend__row">
                <span className="pr-evidence-key pr-evidence-key--reference">i</span> Estación / localidad · observación o pronóstico
              </span>
              <span className="pr-legend__row">
                <span className="pr-evidence-key pr-evidence-key--critical">!</span> Inventario de zona crítica INGEMMET bajo aviso · no es
                un evento confirmado
              </span>
              <span className="pr-legend__row">
                <span className="pr-evidence-key pr-evidence-key--area" /> Área y vigencia de pronóstico SENAMHI · no es daño ocurrido
              </span>
            </div>
          )}
          <div className="pr-legend__group">
            <span className="pr-legend__title">Icono · motivo del evento</span>
            {LEGEND_CAUSES.map((cause) => (
              <span key={cause} className="pr-legend__row">
                <Icon name={cause} size={13} />
                {CAUSE_META[cause].short}
              </span>
            ))}
          </div>
          {layers.alerts && (
            <div className="pr-legend__group pr-legend__group--wide">
              <span className="pr-legend__title">Huaicos y deslizamientos</span>
              <span className="pr-legend__row">
                <span
                  className="pr-legend__line"
                  style={{ background: "radial-gradient(circle, #c1121f 0 30%, #f3722c 30% 60%, #f9c74f 60%)", height: 10 }}
                />
                <span>
                  Zona resaltada (5 km huaico, 3,5 km deslizamiento) <span className="pr-muted">· énfasis visual, no área de impacto</span>
                </span>
              </span>
              <span className="pr-legend__row">
                <span className="pr-legend__line" style={{ background: "#c1121f", boxShadow: "0 0 0 2px #fffdf7" }} />
                Vías dentro de la zona (más gruesa: vía del aviso)
              </span>
            </div>
          )}
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
          {layers.exposure && (
            <div className="pr-legend__group pr-legend__group--wide">
              <span className="pr-legend__title">Pronóstico · ventana seleccionada</span>
              <span className="pr-legend__row">
                <span className="pr-legend__line" style={{ background: "#9456ad", boxShadow: "0 0 0 2px #ffffff" }} />
                Vía en tramo con posible huaico · estimación
              </span>
              <span className="pr-legend__row">
                <span
                  className="pr-legend__line"
                  style={{ background: "linear-gradient(90deg, #9456ad33, #682583aa, #9456ad33)", height: 10 }}
                />
                <span>
                  Banda violeta (~8 km) <span className="pr-muted">· laderas con lluvia prevista; no es un evento reportado</span>
                </span>
              </span>
              <span className="pr-legend__row">
                <span className="pr-legend__line" style={{ background: "#8b8680" }} />
                Sin evaluación (no es riesgo bajo)
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
