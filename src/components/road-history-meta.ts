import type { NationalRoadEvent } from "@/contracts/road-history";

type Category = NationalRoadEvent["category"];

export const HISTORY_CATEGORY_LABELS: Record<Category, string> = {
  debris_flow: "Huaico",
  rockfall_or_slope_failure: "Derrumbe",
  landslide: "Deslizamiento",
  flood: "Inundación",
  road_damage: "Daño de plataforma",
  structure_damage: "Daño en puente u obra de arte",
  social: "Conflicto social",
  traffic: "Siniestro vial",
  other: "Otro",
};

// Three groups keep the past-events layer readable next to the live status markers.
export const HISTORY_GROUP_COLORS = { natural: "#8a5a2b", infrastructure: "#4f6d8a", other: "#9a9285" } as const;
export const HISTORY_CATEGORY_GROUP: Record<Category, keyof typeof HISTORY_GROUP_COLORS> = {
  debris_flow: "natural",
  rockfall_or_slope_failure: "natural",
  landslide: "natural",
  flood: "natural",
  road_damage: "infrastructure",
  structure_damage: "infrastructure",
  social: "other",
  traffic: "other",
  other: "other",
};

/** Initial road state as Provías recorded it; the live STATUS_META labels describe current alerts instead. */
export const HISTORY_STATUS_LABELS: Record<NationalRoadEvent["initialStatus"], string> = {
  interrumpido: "vía interrumpida",
  restringido: "tránsito restringido",
  normal: "transitable",
  desconocido: "estado sin dato",
};
