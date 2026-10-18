"use client";

import { Icon } from "@/components/icons";
import type { ResearchSource } from "@/contracts/research_christian";
import { TOPIC_LABELS } from "@/domain/research/evidence-labels_christian";
import { formatDateTime } from "@/lib/format";

export function ResearchSources({ sources }: { sources: ResearchSource[] }) {
  return (
    <div className="pr-research-sources">
      <p>Fuentes y documentos revisados. Su presencia en este catálogo no significa que exista una alerta vigente.</p>
      {sources.map((source) => (
        <details key={source.id} className="pr-research-source">
          <summary>
            <span>{source.provider}</span>
            {source.title}
          </summary>
          <div>
            <p>{source.categories.map((topic) => TOPIC_LABELS[topic]).join(" · ")}</p>
            <p>Revisado: {formatDateTime(source.verifiedAt)}</p>
            <p>{source.geographicScope}</p>
            <a className="pr-btn pr-btn--xs" href={source.url} target="_blank" rel="noopener noreferrer">
              Consultar documento <Icon name="external" size={11} />
            </a>
            <p>{source.accessStatus}</p>
            {source.observedFacts.length > 0 && (
              <ul>
                {source.observedFacts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            )}
            {source.limitations.length > 0 && (
              <>
                <h4>Límites de uso</h4>
                <ul>
                  {source.limitations.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
