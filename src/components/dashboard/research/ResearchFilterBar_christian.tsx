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
  const points = filtered.filter((record) => record.geometry?.type === "Point").length;
  const areas = filtered.filter((record) => record.geometry && record.geometry.type !== "Point").length;
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
        <strong>{filtered.length}</strong> registros en mapa · {points} puntos · {areas} áreas oficiales
      </span>
      <button type="button" className="pr-btn pr-btn--ghost" disabled={!filtered.length} onClick={onFit}>
        <Icon name="crosshair" size={13} /> Ver todos en mapa
      </button>
      <span className="pr-research-toolbar__hint pr-hide-sm">Inventarios, pronósticos, observaciones y escenarios separados</span>
    </div>
  );
}
