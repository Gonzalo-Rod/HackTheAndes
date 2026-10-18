"use client";

import { Icon } from "@/components/icons";
import { RESEARCH_TOPICS, type EnvironmentalRecord, type ResearchTopic } from "@/contracts/research_christian";
import { TOPIC_LABELS } from "@/domain/research/evidence-labels_christian";

export function ResearchFilterBar({
  records,
  topic,
  onTopicChange,
  onFit,
}: {
  records: EnvironmentalRecord[];
  topic: ResearchTopic | null;
  onTopicChange: (topic: ResearchTopic | null) => void;
  onFit: () => void;
}) {
  const filtered = records.filter((record) => topic === null || record.topics.includes(topic));
  const mapped = filtered.filter((record) => record.coordinates !== null).length;
  return (
    <div className="pr-filterbar pr-research-toolbar">
      <label className="pr-select">
        <span className="pr-sr-only">Tema ambiental</span>
        <select
          aria-label="Tema ambiental"
          value={topic ?? "all"}
          onChange={(event) => onTopicChange(RESEARCH_TOPICS.find((value) => value === event.target.value) ?? null)}
        >
          <option value="all">Todos los temas ambientales</option>
          {RESEARCH_TOPICS.map((value) => (
            <option key={value} value={value}>
              {TOPIC_LABELS[value]}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={12} />
      </label>
      <span className="pr-research-toolbar__count">
        <strong>{filtered.length}</strong> evidencias · <strong>{mapped}</strong> con coordenadas
      </span>
      <button type="button" className="pr-btn pr-btn--ghost" disabled={!mapped} onClick={onFit}>
        <Icon name="crosshair" size={13} /> Ver referencias en mapa
      </button>
      <span className="pr-research-toolbar__hint pr-hide-sm">Pronósticos, observaciones y escenarios identificados por separado</span>
    </div>
  );
}
