import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import type { HazardLayer } from "@/contracts/model-inputs";
import { warningValidity } from "@/domain/road-alerts/warning-validity";
export function addHazardLayers(map: MLMap) {
  for (const id of ["susceptibility", "official-warnings"]) {
    map.addSource(id, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      attribution: id === "susceptibility" ? "INGEMMET · susceptibilidad estática" : "SENAMHI · avisos oficiales",
    });
  }
  map.addLayer({
    id: "susceptibility-fill",
    type: "fill",
    source: "susceptibility",
    paint: {
      "fill-color": [
        "match",
        ["get", "class"],
        0,
        "#999999",
        1,
        "#e5d7c7",
        2,
        "#ceb699",
        3,
        "#ae8966",
        4,
        "#89603e",
        5,
        "#593c29",
        "#999999",
      ],
      "fill-opacity": 0.22,
    },
  });
  map.addLayer({
    id: "official-warning-fill",
    type: "fill",
    source: "official-warnings",
    paint: { "fill-color": "#72558a", "fill-opacity": 0.12 },
  });
  map.addLayer({
    id: "official-warning-outline",
    type: "line",
    source: "official-warnings",
    paint: { "line-color": "#72558a", "line-width": 2, "line-dasharray": [2, 2] },
  });
}
export function setHazardVisibility(map: MLMap, susceptibility: boolean, warnings: boolean) {
  map.setLayoutProperty("susceptibility-fill", "visibility", susceptibility ? "visible" : "none");
  for (const id of ["official-warning-fill", "official-warning-outline"])
    map.setLayoutProperty(id, "visibility", warnings ? "visible" : "none");
}
export function setHazardData(map: MLMap, layer: HazardLayer | null) {
  const susceptibility = map.getSource("susceptibility") as GeoJSONSource | undefined;
  const warnings = map.getSource("official-warnings") as GeoJSONSource | undefined;
  susceptibility?.setData({ type: "FeatureCollection", features: layer?.data.susceptibility.features ?? [] });
  const now = Date.now();
  warnings?.setData({
    type: "FeatureCollection",
    features:
      layer?.data.warnings.features.filter(
        (feature) => warningValidity(feature.properties.validFrom, feature.properties.validUntil, now) === "active",
      ) ?? [],
  });
}
