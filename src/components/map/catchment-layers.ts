import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import type { CatchmentLayer } from "@/contracts/catchments";
export function addCatchmentLayers(map: MLMap) {
  map.addSource("catchments", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    attribution: 'HydroBASINS / HydroSHEDS © WWF · <a href="https://www.hydrosheds.org/products/hydrobasins">source and license</a>',
  });
  map.addLayer({ id: "catchments-fill", type: "fill", source: "catchments", paint: { "fill-color": "#77618e", "fill-opacity": 0.07 } });
  map.addLayer({
    id: "catchments-outline",
    type: "line",
    source: "catchments",
    paint: { "line-color": "#77618e", "line-width": 1, "line-opacity": 0.65, "line-dasharray": [3, 2] },
  });
}
export function setCatchmentVisibility(map: MLMap, visible: boolean) {
  for (const id of ["catchments-fill", "catchments-outline"]) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}
export function setCatchmentData(map: MLMap, layer: CatchmentLayer | null) {
  const source = map.getSource("catchments") as GeoJSONSource | undefined;
  source?.setData({ type: "FeatureCollection", features: layer?.data.features ?? [] });
}
