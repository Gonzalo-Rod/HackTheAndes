"use client";

import { Icon } from "@/components/icons";
import type { EnvironmentalRecord } from "@/contracts/research_christian";
import { KIND_LABELS, TOPIC_LABELS } from "@/domain/research/evidence-labels_christian";
import { evidenceTiming } from "@/domain/research/evidence-state_christian";
import { formatCalendarDate, formatDateTime } from "@/lib/format";

export function evidenceDate(value: string | null): string {
  if (!value) return "Sin fecha precisa";
  return value.length === 10 ? formatCalendarDate(value) : formatDateTime(value);
}

export function evidencePeriod(record: EnvironmentalRecord): string {
  if (!record.startsAt)
    return record.periodLabel ?? (record.issuedAt ? `Publicado: ${evidenceDate(record.issuedAt)}` : "Fecha original sin verificar");
  const start = evidenceDate(record.startsAt);
  return record.endsAt && record.endsAt !== record.startsAt ? `${start} → ${evidenceDate(record.endsAt)}` : start;
}

interface Props {
  record: EnvironmentalRecord;
  related: EnvironmentalRecord[];
  now: number;
  onBack: () => void;
  onCenter: () => void;
  onSelect: (id: string) => void;
}

export function EvidenceDetail({ record, related, now, onBack, onCenter, onSelect }: Props) {
  const timing = evidenceTiming(record, now);
  return (
    <article className="pr-evidence-detail" aria-labelledby="evidence-title">
      <button type="button" className="pr-btn pr-btn--ghost" onClick={onBack}>
        <Icon name="arrowLeft" size={13} /> Todas las evidencias
      </button>
      <div className="pr-evidence__tags">
        <span className={`pr-evidence__badge pr-evidence__badge--${timing.state}`}>{timing.label}</span>
        <span>{KIND_LABELS[record.kind]}</span>
      </div>
      <h2 id="evidence-title">{record.title}</h2>
      <p className="pr-evidence__summary">{record.summary}</p>
      <dl className="pr-evidence__meta">
        <div>
          <dt>Fuente</dt>
          <dd>{record.provider}</dd>
        </div>
        <div>
          <dt>Lugar / alcance</dt>
          <dd>{record.location}</dd>
        </div>
        <div>
          <dt>
            {record.kind === "forecast"
              ? "Vigencia (Lima)"
              : record.kind === "inventory"
                ? "Vigencia del aviso vinculado (Lima)"
                : "Período del registro"}
          </dt>
          <dd>{evidencePeriod(record)}</dd>
        </div>
        {record.issuedAt && (
          <div>
            <dt>Publicación</dt>
            <dd>{evidenceDate(record.issuedAt)}</dd>
          </div>
        )}
        <div>
          <dt>Temas</dt>
          <dd>{record.topics.map((topic) => TOPIC_LABELS[topic]).join(" · ")}</dd>
        </div>
        <div>
          <dt>Ubicación en mapa</dt>
          <dd>
            {record.geometry?.type === "Point"
              ? record.recordType === "critical_zone_under_notice"
                ? "Punto oficial de zona crítica · INGEMMET"
                : "Referencia publicada de estación / localidad"
              : "Polígono oficial de pronóstico · SENAMHI"}
          </dd>
        </div>
        {record.coordinates && (
          <div>
            <dt>Longitud / latitud · WGS84</dt>
            <dd>
              {record.coordinates
                .map((value) => value.toLocaleString("en-US", { maximumFractionDigits: 6, useGrouping: false }))
                .join(", ")}
            </dd>
          </div>
        )}
      </dl>
      <div className="pr-evidence__actions">
        <a className="pr-btn pr-btn--accent" href={record.sourceUrl} target="_blank" rel="noopener noreferrer">
          Abrir fuente oficial <Icon name="external" size={12} />
        </a>
        {record.geometrySourceUrl && (
          <a className="pr-btn" href={record.geometrySourceUrl} target="_blank" rel="noopener noreferrer">
            Ver coordenadas oficiales <Icon name="external" size={12} />
          </a>
        )}
        {record.geometry && (
          <button type="button" className="pr-btn" onClick={onCenter}>
            <Icon name="crosshair" size={13} /> Ver en mapa
          </button>
        )}
      </div>
      {record.facts.length > 0 && (
        <section className="pr-evidence__facts" aria-label="Valores del reporte">
          <h3>Datos de la fuente</h3>
          <dl>
            {record.facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {record.forecasts.length > 0 && (
        <section className="pr-evidence__facts">
          <h3>Temperaturas del pronóstico</h3>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Mín.</th>
                <th>Máx.</th>
              </tr>
            </thead>
            <tbody>
              {record.forecasts.map((day) => (
                <tr key={day.date}>
                  <td>{formatCalendarDate(day.date)}</td>
                  <td>{day.tminC === null ? "—" : `${day.tminC} °C`}</td>
                  <td>{day.tmaxC === null ? "—" : `${day.tmaxC} °C`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>—: la fuente no publicó una temperatura en el registro revisado.</p>
        </section>
      )}
      <section className="pr-evidence__caveats">
        <h3>Cómo interpretar este registro</h3>
        <ul>
          {record.caveats.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
      {related.length > 0 && (
        <section className="pr-evidence__related">
          <h3>Otros registros en esta referencia</h3>
          {related.map((item) => (
            <button type="button" key={item.id} onClick={() => onSelect(item.id)}>
              {item.title} <Icon name="arrowRight" size={12} />
            </button>
          ))}
        </section>
      )}
    </article>
  );
}
