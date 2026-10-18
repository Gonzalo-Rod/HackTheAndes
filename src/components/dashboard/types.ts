// UI state types for the dashboard (view configuration, not business rules).

export type MapMode = "2d" | "3d";
export type NetworkColorBy = "neutral" | "condition";
export type Scope = "pais" | "pe22";
export type SidebarTab = "capas" | "detalle" | "fuentes" | "pronostico";

export interface LayerState {
  alerts: boolean;
  exposure: boolean;
  terrain: boolean;
  exaggeration: number;
  hillshade: boolean;
  hillshadeOpacity: number;
  satellite: boolean;
  satelliteOpacity: number;
  network: boolean;
  networkOpacity: number;
  networkColorBy: NetworkColorBy;
  corridor: boolean;
  rain: boolean;
  catchments: boolean;
  susceptibility: boolean;
  officialWarnings: boolean;
  rivers: boolean;
  riversOpacity: number;
  regions: boolean;
}

export const DEFAULT_LAYERS: LayerState = {
  alerts: true,
  exposure: true,
  terrain: true,
  exaggeration: 1.5,
  hillshade: true,
  hillshadeOpacity: 0.8,
  satellite: false,
  satelliteOpacity: 1,
  network: true,
  networkOpacity: 0.7,
  networkColorBy: "neutral",
  corridor: true,
  rain: true,
  catchments: true,
  susceptibility: false,
  officialWarnings: true,
  rivers: true,
  riversOpacity: 0.8,
  regions: true,
};

export const EXAGGERATION_OPTIONS = [1, 1.5, 2, 3] as const;

// The road-condition ramp for the national network is ordinal (Bueno → Regular → Malo),
// so it uses one hue stepped light → dark (blue steps 350 / 500 / 700, validated as an
// ordinal ramp against the map's land color #efeae0).
export const CONDITION_COLORS: Record<string, string> = {
  Bueno: "#5598e7",
  Regular: "#256abf",
  Malo: "#0d366b",
};
export const CONDITION_FALLBACK = "#b5ada0";
