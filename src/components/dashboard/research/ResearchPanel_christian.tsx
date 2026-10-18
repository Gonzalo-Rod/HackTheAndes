"use client";

import { useState, type ReactNode } from "react";

import { Icon } from "@/components/icons";
import type { EnvironmentalRecord, ResearchTopic } from "@/contracts/research_christian";
import { KIND_LABELS } from "@/domain/research/evidence-labels_christian";
import { evidenceTiming, groupEvidencePoints, sortEvidence } from "@/domain/research/evidence-state_christian";
import type { ResearchCatalogState } from "@/hooks/use-research-catalog_christian";
import { formatDateTime } from "@/lib/format";

import { EvidenceDetail, evidencePeriod } from "./EvidenceDetail_christian";
import { ResearchArchive } from "./ResearchArchive_christian";
import { ResearchSources } from "./ResearchSources_christian";

const INITIAL_RECORDS = 12;
interface Props {
  state: ResearchCatalogState;
  now: number | null;
  topic: ResearchTopic | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCenter: (record: EnvironmentalRecord) => void;
  liveSources: ReactNode;
  records?: EnvironmentalRecord[];
  coverage?: string;
}

export function ResearchPanel({
  state,
  now,
  topic,
  selectedId,
  onSelect,
  onCenter,
  liveSources,
  records: scopedRecords,
  coverage = "Todo el Perú · fuentes oficiales",
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const { data, error } = state;
  if (!data)
    return (
      <div className="pr-empty pr-empty--panel" role="status">
        <Icon name="source" size={22} />
        <p>{error ?? "Cargando las evidencias oficiales y el archivo de investigación…"}</p>
        {error && (
          <button type="button" className="pr-btn" onClick={() => void state.refresh()}>
            Reintentar
          </button>
        )}
      </div>
    );
  const nowMs = now ?? Date.parse(data.servedAt);
  const filtered = (scopedRecords ?? data.records).filter((record) => topic === null || record.topics.includes(topic));
  const records = sortEvidence(filtered, nowMs);
  const selected = data.records.find((record) => record.id === selectedId);
  const relatedIds = selected
    ? (groupEvidencePoints(data.records).find((point) => point.recordIds.includes(selected.id))?.recordIds ?? [])
    : [];
  const sources = data.sources.filter((source) => topic === null || source.categories.includes(topic));
  return (
    <div className="pr-research">
      {(error || data.warnings.length > 0) && (
        <div className="pr-research__warning" role="status">
          {error && <p>{error}</p>}
          {data.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <button type="button" className="pr-btn pr-btn--xs" disabled={state.refreshing} onClick={() => void state.refresh()}>
            Reintentar consulta
          </button>
        </div>
      )}
      {selected ? (
        <EvidenceDetail
          record={selected}
          related={data.records.filter((record) => record.id !== selected.id && relatedIds.includes(record.id))}
          now={nowMs}
          onBack={() => onSelect(null)}
          onCenter={() => onCenter(selected)}
          onSelect={onSelect}
        />
      ) : (
        <>
          <header className="pr-research__intro">
            <span className="pr-research__eyebrow">CLIMA Y TERRITORIO</span>
            <h2>Riesgos y condiciones del territorio</h2>
            <p>
              Solo registros con ubicación, fecha y fuente oficial verificadas. El inventario de zonas críticas se distingue de los avisos y
              eventos.
            </p>
            <span className="pr-research__coverage">{coverage}</span>
          </header>
          <p className="pr-research__guide">
            <span className="pr-evidence-key" /> Los {records.length} registros están en el mapa. ! = zona crítica inventariada; i =
            referencia; áreas sombreadas = pronósticos. Ningún punto confirma un incidente.
          </p>
          <div className="pr-evidence-list" aria-label="Evidencias ambientales">
            {(showAll ? records : records.slice(0, INITIAL_RECORDS)).map((record) => {
              const timing = evidenceTiming(record, nowMs);
              return (
                <button type="button" className="pr-evidence-card" key={record.id} onClick={() => onSelect(record.id)}>
                  <span className="pr-evidence__tags">
                    <span className={`pr-evidence__badge pr-evidence__badge--${timing.state}`}>{timing.label}</span>
                    <span>
                      {record.geometry?.type === "Point"
                        ? record.recordType === "critical_zone_under_notice"
                          ? "Zona crítica · no es un incidente"
                          : "Estación / localidad"
                        : "Área oficial"}
                    </span>
                  </span>
                  <strong>{record.title}</strong>
                  <span className="pr-evidence-card__summary">{record.summary}</span>
                  <span className="pr-evidence-card__period">{evidencePeriod(record)}</span>
                  <span className="pr-evidence-card__footer">
                    {record.provider}
                    <span>
                      {KIND_LABELS[record.kind]} <Icon name="arrowRight" size={12} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {records.length === 0 && (
            <p className="pr-research__muted">
              No se encontraron registros con fecha y geometría verificadas para este tema y cobertura. Esto no equivale a ausencia de
              riesgo.
            </p>
          )}
          {records.length > INITIAL_RECORDS && (
            <button type="button" className="pr-btn pr-research__more" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
              {showAll ? "Resumir lista" : `Ver lista completa (${records.length}); todos ya están en el mapa`}
            </button>
          )}
        </>
      )}
      <p className="pr-research__capture">
        Investigación revisada: {formatDateTime(data.retrievedAt)}. Es una captura documentada; la vigencia de cada pronóstico se calcula
        con la fecha actual.
      </p>
      <details className="pr-research__disclosure">
        <summary>Archivo vial y noticias · {data.weeklyReports.length} semana(s)</summary>
        <ResearchArchive reports={data.weeklyReports} />
      </details>
      <details className="pr-research__disclosure">
        <summary>Fuentes y verificación · {sources.length} referencias</summary>
        <ResearchSources sources={sources} />
        {liveSources}
      </details>
      <details className="pr-research__disclosure">
        <summary>Documentos y reportes de la investigación · {data.documents.length}</summary>
        <p>
          {data.archivedRecordCount} referencias sin fecha o geometría verificadas quedan solo en los documentos originales. Las noticias
          pendientes tampoco generan pines.
        </p>
        <ul className="pr-research__documents">
          {data.documents.map((document) => (
            <li key={document.name}>
              <a href={document.url} target="_blank" rel="noopener noreferrer">
                {document.title}
                <span>
                  {document.format.toUpperCase()} <Icon name="external" size={11} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </details>
      <p className="pr-research__footnote">
        El alcance de una operación minera específica debe confirmarse antes de atribuirle estos avisos. No se verificó un brote local de
        plagas ni un corte vial causado por estas observaciones.
      </p>
    </div>
  );
}
