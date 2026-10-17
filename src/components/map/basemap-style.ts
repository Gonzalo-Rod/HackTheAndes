import type { StyleSpecification } from "maplibre-gl";

// Warm, paper-like topographic basemap. Free sources without API keys:
// - Vector tiles: OpenFreeMap (OpenMapTiles schema, OpenStreetMap data)
// - Terrain: AWS Terrain Tiles (Terrarium encoding)
// - Satellite: Sentinel-2 cloudless 2016 by EOX (CC BY 4.0)

export const TERRAIN_SOURCE = "terrain-dem";
export const HILLSHADE_SOURCE = "hillshade-dem";
export const SATELLITE_LAYER = "satellite";
export const HILLSHADE_LAYER = "hillshade";

const FONT_REGULAR = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];
const FONT_ITALIC = ["Noto Sans Italic"];
const NAME: ["coalesce", ["get", string], ["get", string]] = ["coalesce", ["get", "name:es"], ["get", "name"]];

export const PALETTE = {
  background: "#ebe6db",
  land: "#efeae0",
  wood: "#dfe2cc",
  grass: "#e7e6d1",
  sand: "#ece2cb",
  rock: "#e4ddd0",
  ice: "#f8f8f5",
  urban: "#e4ddd0",
  water: "#b7cdd6",
  waterLine: "#a3bfcb",
  boundary: "#8f8371",
  road: "#fbf8f1",
  roadCasing: "#d9cfbd",
  label: "#4a443a",
  labelMuted: "#6f685c",
  halo: "#f6f2ea",
  waterLabel: "#5d7f8e",
};

const TERRARIUM_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];

export function createBaseStyle(): StyleSpecification {
  return {
    version: 8,
    name: "PeruRoad warm topo",
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      omt: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores de OpenStreetMap</a>',
      },
      [TERRAIN_SOURCE]: {
        type: "raster-dem",
        tiles: TERRARIUM_TILES,
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 13,
        attribution:
          'Relieve: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Mapzen Terrain Tiles en AWS</a>',
      },
      [HILLSHADE_SOURCE]: {
        type: "raster-dem",
        tiles: TERRARIUM_TILES,
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 13,
      },
      satellite: {
        type: "raster",
        tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg"],
        tileSize: 256,
        maxzoom: 14,
        attribution:
          '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless 2016</a> por EOX (datos Copernicus Sentinel modificados)',
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": PALETTE.background } },
      {
        id: "landcover",
        type: "fill",
        source: "omt",
        "source-layer": "landcover",
        paint: {
          "fill-color": [
            "match",
            ["get", "class"],
            "wood",
            PALETTE.wood,
            "grass",
            PALETTE.grass,
            "farmland",
            PALETTE.grass,
            "wetland",
            PALETTE.grass,
            "sand",
            PALETTE.sand,
            "rock",
            PALETTE.rock,
            "ice",
            PALETTE.ice,
            PALETTE.land,
          ],
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.55, 10, 0.8],
        },
      },
      {
        id: "landuse-urban",
        type: "fill",
        source: "omt",
        "source-layer": "landuse",
        filter: ["in", ["get", "class"], ["literal", ["residential", "suburb", "neighbourhood", "commercial", "industrial"]]],
        paint: { "fill-color": PALETTE.urban, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 11, 0.7] },
      },
      {
        id: "water",
        type: "fill",
        source: "omt",
        "source-layer": "water",
        paint: { "fill-color": PALETTE.water },
      },
      {
        id: SATELLITE_LAYER,
        type: "raster",
        source: "satellite",
        layout: { visibility: "none" },
        paint: { "raster-opacity": 1, "raster-saturation": -0.15, "raster-contrast": 0.05, "raster-fade-duration": 200 },
      },
      {
        id: HILLSHADE_LAYER,
        type: "hillshade",
        source: HILLSHADE_SOURCE,
        paint: {
          "hillshade-shadow-color": "#5b4b39",
          "hillshade-highlight-color": "#fffcf3",
          "hillshade-accent-color": "#6e5c47",
          "hillshade-exaggeration": 0.42,
          "hillshade-illumination-direction": 315,
        },
      },
      {
        id: "waterway",
        type: "line",
        source: "omt",
        "source-layer": "waterway",
        minzoom: 8,
        filter: ["in", ["get", "class"], ["literal", ["river", "canal", "stream"]]],
        paint: {
          "line-color": PALETTE.waterLine,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, ["match", ["get", "class"], "river", 0.8, 0.3], 14, ["match", ["get", "class"], "river", 2.4, 1]],
        },
      },
      {
        id: "boundary-region",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        minzoom: 5,
        paint: { "line-color": PALETTE.boundary, "line-opacity": 0.35, "line-width": 0.7, "line-dasharray": [3, 2] },
      },
      {
        id: "boundary-country",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": PALETTE.boundary, "line-opacity": 0.8, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 8, 1.6] },
      },
      {
        id: "road-casing",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 7,
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": PALETTE.roadCasing,
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.6, 12, 4, 15, 9],
          "line-opacity": 0.8,
        },
      },
      {
        id: "road",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 7,
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary", "minor"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": PALETTE.road,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            ["match", ["get", "class"], ["motorway", "trunk", "primary"], 0.5, 0],
            12,
            ["match", ["get", "class"], ["motorway", "trunk", "primary"], 2.6, ["secondary", "tertiary"], 1.6, 0.6],
            15,
            ["match", ["get", "class"], ["motorway", "trunk", "primary"], 7, ["secondary", "tertiary"], 5, 2.5],
          ],
        },
      },
    ],
    sky: {
      "sky-color": "#c9d6dd",
      "horizon-color": "#efe7d9",
      "fog-color": "#ece6da",
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.5,
      // Terrain includes bathymetry: at national zoom ground fog would wash out the sea floor.
      "fog-ground-blend": ["interpolate", ["linear"], ["zoom"], 5, 1, 9, 0.9],
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 9, 0.2],
    },
  };
}

/** Label layers, added last so they sit above the thematic overlays. */
export function createLabelLayers(): StyleSpecification["layers"] {
  return [
    {
      id: "label-water",
      type: "symbol",
      source: "omt",
      "source-layer": "water_name",
      layout: {
        "text-field": NAME,
        "text-font": FONT_ITALIC,
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 8, 13],
        "text-letter-spacing": 0.08,
        "symbol-placement": ["case", ["==", ["geometry-type"], "LineString"], "line", "point"],
      },
      paint: { "text-color": PALETTE.waterLabel, "text-halo-color": PALETTE.halo, "text-halo-width": 1 },
    },
    {
      id: "label-peak",
      type: "symbol",
      source: "omt",
      "source-layer": "mountain_peak",
      minzoom: 9,
      filter: ["all", ["has", "name"], ["has", "ele"]],
      layout: {
        "text-field": [
          "format",
          "▲ ",
          { "font-scale": 0.75 },
          NAME,
          {},
          ["concat", "\n", ["to-string", ["get", "ele"]], " m"],
          { "font-scale": 0.85, "text-color": PALETTE.labelMuted },
        ],
        "text-font": FONT_REGULAR,
        "text-size": 11,
        "text-anchor": "top",
        "text-max-width": 9,
        "symbol-sort-key": ["get", "rank"],
      },
      paint: { "text-color": PALETTE.label, "text-halo-color": PALETTE.halo, "text-halo-width": 1.2 },
    },
    {
      id: "label-place-minor",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      minzoom: 8,
      filter: ["in", ["get", "class"], ["literal", ["town", "village"]]],
      layout: {
        "text-field": NAME,
        "text-font": FONT_REGULAR,
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10.5, 13, 13],
        "text-max-width": 8,
      },
      paint: { "text-color": PALETTE.label, "text-halo-color": PALETTE.halo, "text-halo-width": 1.2 },
    },
    {
      id: "label-city",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      minzoom: 4.5,
      filter: ["==", ["get", "class"], "city"],
      layout: {
        "text-field": NAME,
        "text-font": ["case", ["<=", ["get", "rank"], 4], ["literal", FONT_BOLD], ["literal", FONT_REGULAR]] as never,
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, ["match", ["get", "capital"], 2, 13, 11], 10, 15],
        "text-max-width": 8,
      },
      paint: { "text-color": "#2f2a23", "text-halo-color": PALETTE.halo, "text-halo-width": 1.4 },
    },
    {
      id: "label-region",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      minzoom: 5,
      maxzoom: 8,
      filter: ["==", ["get", "class"], "state"],
      layout: {
        "text-field": ["upcase", NAME],
        "text-font": FONT_REGULAR,
        "text-size": 10,
        "text-letter-spacing": 0.18,
        "text-max-width": 7,
      },
      paint: { "text-color": PALETTE.labelMuted, "text-halo-color": PALETTE.halo, "text-halo-width": 1, "text-opacity": 0.85 },
    },
    {
      id: "label-country",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      maxzoom: 7,
      filter: ["==", ["get", "class"], "country"],
      layout: {
        "text-field": ["upcase", NAME],
        "text-font": FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 6, 15],
        "text-letter-spacing": 0.3,
      },
      paint: { "text-color": "#5a5245", "text-halo-color": PALETTE.halo, "text-halo-width": 1.4 },
    },
  ];
}
