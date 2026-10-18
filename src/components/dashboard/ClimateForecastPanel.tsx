"use client";
import { useEffect, useRef } from "react";
import { formatDateTime } from "@/lib/format";
import { Icon } from "@/components/icons";
import type { ClimateForecastState } from "@/hooks/use-climate-forecast";
import type { ForecastEvent } from "@/domain/exposure/forecast-events";
import { formatForecastWindow } from "@/domain/exposure/forecast-events";
import type { ForecastSupport } from "@/domain/exposure/forecast-support";

interface Props {
  forecast: ClimateForecastState;
  visible: boolean;
  onToggle: () => void;
  onFocus: (event: ForecastEvent) => void;
  support: ForecastSupport | null;
  onOpenNotice: (recordId: string) => void;
}
export function ClimateForecastPanel({ forecast, visible, onToggle, onFocus, support, onOpenNotice }: Props) {
  const selectedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [forecast.selected?.id]);
  const { projection, window: active, view } = forecast;
  return (
    <section className="pr-panel pr-forecast" aria-labelledby="forecast-title">
      <header className="pr-panel__head">
        <h2 id="forecast-title">Posibles huaicos</h2>
        <span className="pr-forecast__tag">ESTIMACIÓN</span>
      </header>
      <p className="pr-forecast__note">Corredor piloto: Carretera Central (PE-22). El resto del país aún no tiene esta estimación.</p>
      {projection.capturedAt && <p className="pr-forecast__note">Lluvia actualizada: {formatDateTime(projection.capturedAt)} (Perú).</p>}
      <p className="pr-forecast__intro">
        Lluvia prevista sobre terreno susceptible. No son huaicos reportados ni probabilidades calculadas.
      </p>
      <div className="pr-forecast__controls">
        <label>
          Horizonte
          <select value={forecast.horizonHours} onChange={(event) => forecast.setHorizonHours(event.target.value === "72" ? 72 : 24)}>
            <option value="24">Próximas 24 h</option>
            <option value="72">Próximas 72 h</option>
          </select>
        </label>
        <button type="button" className="pr-btn" onClick={forecast.refresh} aria-label="Actualizar pronóstico">
          <Icon name="refresh" size={14} />
        </button>
      </div>
      <label className="pr-forecast__toggle">
        <input type="checkbox" checked={visible} onChange={onToggle} /> Mostrar estimaciones en el mapa
      </label>
      {forecast.loading && <p role="status">Cargando evaluación y ventanas previstas…</p>}
      {forecast.error && (
        <p role="status" className="pr-forecast__warning">
          {forecast.error}
        </p>
      )}
      {forecast.map.message && (
        <p role="status" className="pr-forecast__warning">
          {forecast.map.message}
        </p>
      )}
      {!forecast.loading && projection.state !== "ready" && (
        <p role="status" className="pr-forecast__warning">
          {projection.message}
        </p>
      )}
      {active && (
        <>
          <label className="pr-forecast__period">
            Fecha y franja prevista (hora Perú)
            <select value={active.id} onChange={(event) => forecast.setWindowId(event.target.value)}>
              {projection.windows.map((window) => (
                <option key={window.id} value={window.id}>
                  {formatForecastWindow(window)} · {window.events.length} {window.events.length === 1 ? "zona" : "zonas"}
                </option>
              ))}
            </select>
          </label>
          <p className="pr-forecast__coverage">
            {active.assessedSegments} de {active.assessedSegments + active.unknownSegments} tramos evaluados ·{" "}
            <strong>{active.unknownSegments} sin evaluación</strong>.
          </p>
          <p className="pr-forecast__note">{projection.message}</p>
          {support && <OfficialSupport support={support} onOpenNotice={onOpenNotice} />}
          {!active.events.length && (
            <p className="pr-forecast__empty">
              Sin señal elevada en los tramos evaluados para esta franja. No confirma vía libre ni ausencia de peligro.
            </p>
          )}
          <div className="pr-forecast__events">
            {active.events.map((event) => (
              <article
                key={event.id}
                ref={forecast.selected?.id === event.id ? selectedRef : undefined}
                className={`pr-forecast__event${forecast.selected?.id === event.id ? " is-selected" : ""}`}
              >
                <header>
                  <span className="pr-forecast__type">
                    <Icon name="fenomenos_naturales" size={14} /> Posible huaico · estimación
                  </span>
                  <span>{event.category === "high_attention" ? "Atención alta" : "Atención prioritaria"}</span>
                </header>
                <h3>
                  Km aprox. {event.startKm.toFixed(1)}–{event.endKm.toFixed(1)}
                </h3>
                <p className="pr-forecast__time">
                  <Icon name="clock" size={12} /> {formatForecastWindow(event)}
                </p>
                <dl>
                  <div>
                    <dt>Lluvia prevista / 6 h</dt>
                    <dd>Hasta {event.rainMm.toFixed(1)} mm</dd>
                  </div>
                  <div>
                    <dt>Terreno susceptible</dt>
                    <dd>Hasta {Math.round(event.highSusceptibilityFraction * 100)}% del área alta / muy alta</dd>
                  </div>
                </dl>
                {event.reasons.includes("antecedent_wet_weather") && (
                  <p className="pr-forecast__note">La lluvia acumulada previa también eleva la atención.</p>
                )}
                <p className="pr-forecast__note">Distancias del mapa, no km oficiales. Ubicación y vínculo con la cuenca aproximados.</p>
                <button type="button" className="pr-btn" disabled={!forecast.map.bounds[event.id]} onClick={() => onFocus(event)}>
                  <Icon name="pin" size={13} /> Ver tramo en mapa
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      {view && (
        <details className="pr-forecast__sources">
          <summary>Fuentes, fecha y límites</summary>
          <p>Datos meteorológicos capturados: {formatDateTime(view.data.sources.weatherCapturedAt)} (Perú).</p>
          <p>
            Open-Meteo / ECMWF: lluvia de modelo, grilla aproximada de {view.data.sources.nominalGridResolutionKm} km. INGEMMET:
            susceptibilidad estática, no detección de huaicos.
          </p>
          <p>
            La lluvia y el porcentaje mostrados son máximos entre cuencas enlazadas, no promedios del tramo. Asociación de cuencas de baja
            confianza. Reglas experimentales; no indican que ocurrirá un huaico ni que se cerrará la vía.
          </p>
          <p>
            La fecha de emisión del pronóstico y la fecha de publicación de susceptibilidad no están informadas. Captura de susceptibilidad:{" "}
            {formatDateTime(view.data.sources.hazardsCapturedAt)} (Perú). Política: {view.data.policy.version}.
          </p>
          <ul>
            {view.data.sources.sourceUrls.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer">
                  {new URL(url).hostname}
                  <Icon name="external" size={11} />
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Official notices are decision support beside the estimate; they never replace or lower it. */
function OfficialSupport({ support, onOpenNotice }: { support: ForecastSupport; onOpenNotice: (recordId: string) => void }) {
  return (
    <section className="pr-forecast__support" aria-label="Respaldo con avisos oficiales">
      <h3>Respaldo oficial · misma franja</h3>
      {support.state === "unavailable" && (
        <p className="pr-forecast__warning">Fuentes oficiales no disponibles. La estimación se mantiene; no implica ausencia de aviso.</p>
      )}
      {support.state === "none" && (
        <p className="pr-forecast__note">
          Ningún pronóstico o aviso SENAMHI/INGEMMET verificado coincide con esta franja en el entorno PE-22. No confirma vía libre ni
          reduce la atención estimada.
        </p>
      )}
      {support.state === "corroborated" && (
        <>
          <p className="pr-forecast__note">
            Pronósticos y avisos oficiales vigentes en el entorno PE-22 y Mantaro durante esta franja. Su área es de referencia, no un tramo
            de la vía.
          </p>
          <ul>
            {support.precipitationNotices.map((record) => (
              <li key={record.id}>
                <button type="button" className="pr-btn pr-btn--link" onClick={() => onOpenNotice(record.id)}>
                  {record.provider} · {record.title}
                </button>
              </li>
            ))}
            {support.criticalZoneCount > 0 && <li>{support.criticalZoneCount} zonas críticas INGEMMET bajo aviso</li>}
          </ul>
        </>
      )}
    </section>
  );
}
