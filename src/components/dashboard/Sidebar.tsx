"use client";

import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/icons";

import type { SidebarTab } from "./types";

const TABS: { value: SidebarTab; label: string; icon: IconName }[] = [
  { value: "capas", label: "Capas", icon: "layers" },
  { value: "detalle", label: "Detalle", icon: "info" },
  { value: "fuentes", label: "Fuentes", icon: "source" },
];

interface SidebarProps {
  tab: SidebarTab;
  hasSelection: boolean;
  onTabChange: (tab: SidebarTab) => void;
  layersContent: ReactNode;
  detailContent: ReactNode;
  sourcesContent: ReactNode;
}

export function Sidebar({ tab, hasSelection, onTabChange, layersContent, detailContent, sourcesContent }: SidebarProps) {
  return (
    <aside className="pr-sidebar" aria-label="Panel lateral">
      <div className="pr-tabs" role="tablist" aria-label="Secciones del panel">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`tab-${item.value}`}
            aria-selected={tab === item.value}
            aria-controls={`panel-${item.value}`}
            className="pr-tabs__item"
            onClick={() => onTabChange(item.value)}
          >
            <Icon name={item.icon} size={13} />
            {item.label}
            {item.value === "detalle" && hasSelection && <span className="pr-tabs__dot" aria-label="alerta seleccionada" />}
          </button>
        ))}
      </div>
      <div className="pr-sidebar__body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
        {tab === "capas" && layersContent}
        {tab === "detalle" && detailContent}
        {tab === "fuentes" && sourcesContent}
      </div>
    </aside>
  );
}
