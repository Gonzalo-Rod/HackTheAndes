"use client";

import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/icons";

import type { SidebarTab } from "./types";

const TABS: { value: SidebarTab; label: string; icon: IconName }[] = [
  { value: "alertas", label: "Vías", icon: "pin" },
  { value: "pronostico", label: "Pronóstico", icon: "clock" },
  { value: "ambiente", label: "Clima y territorio", icon: "environment" },
  { value: "capas", label: "Capas", icon: "layers" },
];

interface SidebarProps {
  tab: SidebarTab;
  alertsCount: number;
  hasSelection: boolean;
  onTabChange: (tab: SidebarTab) => void;
  eventsContent: ReactNode;
  environmentContent: ReactNode;
  detailContent: ReactNode;
  layersContent: ReactNode;
  forecastContent: ReactNode;
}

export function Sidebar({
  tab,
  alertsCount,
  hasSelection,
  onTabChange,
  eventsContent,
  environmentContent,
  detailContent,
  layersContent,
  forecastContent,
}: SidebarProps) {
  const activeTab = tab === "detalle" ? "alertas" : tab;
  return (
    <aside className="pr-sidebar" aria-label="Panel lateral de avisos y capas">
      <div className="pr-tabs" role="tablist" aria-label="Secciones del panel">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`tab-${item.value}`}
            aria-selected={activeTab === item.value}
            aria-controls={`panel-${item.value}`}
            className="pr-tabs__item"
            onClick={() => onTabChange(item.value)}
          >
            <Icon name={item.icon} size={13} />
            <span>{item.label}</span>
            {item.value === "alertas" && <span className="pr-tabs__count">{alertsCount}</span>}
          </button>
        ))}
      </div>
      <div className="pr-sidebar__body" role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} tabIndex={0}>
        {activeTab === "alertas" && (hasSelection ? detailContent : eventsContent)}
        {activeTab === "ambiente" && environmentContent}
        {activeTab === "capas" && layersContent}
        {activeTab === "pronostico" && forecastContent}
      </div>
    </aside>
  );
}
