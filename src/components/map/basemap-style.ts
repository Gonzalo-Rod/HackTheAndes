import type { StyleSpecification } from "maplibre-gl";

// Warm, paper-like topographic basemap. Free sources without API keys:
// - Vector tiles: OpenFreeMap (OpenMapTiles schema, OpenStreetMap data)
// - Terrain: AWS Terrain Tiles (Terrarium encoding)
// - Satellite: Esri World Imagery (high-resolution aerial & satellite orthophotos)

export const TERRAIN_SOURCE = "terrain-dem";
export const HILLSHADE_SOURCE = "hillshade-dem";
export const SATELLITE_LAYER = "satellite";
export const HILLSHADE_LAYER = "hillshade";
export const COLOR_RELIEF_LAYER = "color-relief";

const FONT_REGULAR = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];
const FONT_ITALIC = ["Noto Sans Italic"];
const NAME: ["coalesce", ["get", string], ["get", string]] = ["coalesce", ["get", "name:es"], ["get", "name"]];

export const PALETTE = {
  background: "#5c873b", // Rich natural valley green background (eliminates white patches)
  land: "#6e9948", // Natural soil / earth fallback
  wood: "#1c4a20", // Deep forest understory green
  scrub: "#436e2b", // Lush Andean shrubbery & bushes
  grass: "#599933", // Fresh lively natural meadow / grass
  crop: "#6aa137", // Fertile agricultural fields & valley crops
  wetland: "#366e47", // Wetlands & riverbank vegetation
  sand: "#c4ae85", // Natural riverbed gravel & sand / alluvial wash
  rock: "#736757", // Rugged mountain rock & scree
  ice: "#f2f6fa", // Glacier & perennial snow
  urban: "#857a6c", // Warm earthen urban settlement tone (subtle & translucent)
  urbanBorder: "#6e6355",
  water: "#367591", // Clear mountain river blue
  waterLine: "#245c73",
  boundary: "#5c5344",
  road: "#3a352f", // Asphalt highway / primary roads
  roadMinor: "#4d4740", // Secondary roads
  roadLocal: "#5e574d", // Local paved streets
  roadCasing: "#1f1c18", // Road casing
  label: "#26221c",
  labelMuted: "#474035",
  halo: "#fbf8f2",
  waterLabel: "#1b4657",
};

const TERRARIUM_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];

export function createBaseStyle(): StyleSpecification {
  return {
    version: 8,
    name: "PeruRoad realistic topo",
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
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 17,
        attribution:
          'Imágenes satelitales: &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics',
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": PALETTE.background } },
      {
        // Elevation tint: lush green lowlands & valleys (keeping other countries green),
        // rich Andean mountain greens, transitioning to golden Puna and snow peaks.
        id: COLOR_RELIEF_LAYER,
        type: "color-relief",
        source: HILLSHADE_SOURCE,
        paint: {
          "color-relief-opacity": 1,
          "color-relief-color": [
            "interpolate",
            ["linear"],
            ["elevation"],
            -20,
            "rgba(140, 176, 98, 0)",
            0,
            "#84aa5e", // Coast & lowlands: fresh, natural green
            150,
            "#76a150", // River valleys & low foothills: lush green
            500,
            "#659642", // Lower Andean valleys (Chosica, Santa Eulalia): vibrant green
            1000,
            "#588c37", // Mountain valleys: rich verdant green
            1800,
            "#528432", // Mid Andean slopes: lush mountain green
            2600,
            "#698c3c", // Quechua slopes & terraces: healthy green
            3400,
            "#8ba052", // High slopes: tawny mountain olive-green
            4000,
            "#ab9a5a", // High Puna grassland: golden ichu & earth
            4400,
            "#967f57", // High alpine slopes: rocky brown earth
            4800,
            "#786b5e", // High mountain passes & crags: slate rock
            5300,
            "#9e9993", // High alpine rock
            5800,
            "#d8dcde", // Glacial moraine / snow line
            6300,
            "#ffffff", // High snowy summits
          ],
        },
      },
      {
        id: "landcover",
        type: "fill",
        source: "omt",
        "source-layer": "landcover",
        paint: {
          "fill-color": [
            "match",
            ["get", "class"],
            ["wood", "forest"],
            PALETTE.wood, // Lush dense tree foliage
            ["scrub", "shrub", "bush"],
            PALETTE.scrub, // Vibrant Andean shrubbery
            ["grass", "meadow", "fell", "heath"],
            PALETTE.grass, // Fresh meadow / grass
            ["farmland", "crop", "orchard", "vineyard", "allotments"],
            PALETTE.crop, // Fertile valley crops & fields
            ["wetland", "marsh", "swamp", "bog"],
            PALETTE.wetland,
            ["sand", "desert", "shingle"],
            PALETTE.sand, // Riverbed gravel / sand
            ["rock", "bare_rock", "scree", "cliff"],
            PALETTE.rock, // Mountain rock / scree
            ["ice", "glacier"],
            PALETTE.ice,
            PALETTE.land,
          ],
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.5, 10, 0.72, 14, 0.88],
        },
      },
      {
        id: "landuse-green",
        type: "fill",
        source: "omt",
        "source-layer": "landuse",
        filter: [
          "in",
          ["get", "class"],
          [
            "literal",
            [
              "park",
              "meadow",
              "allotments",
              "cemetery",
              "recreation_ground",
              "pitch",
              "forest",
              "grass",
              "orchard",
              "vineyard",
              "agriculture",
            ],
          ],
        ],
        paint: {
          "fill-color": [
            "match",
            ["get", "class"],
            ["forest", "wood"],
            PALETTE.wood,
            ["orchard", "vineyard", "allotments", "agriculture"],
            PALETTE.crop,
            PALETTE.grass,
          ],
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.5, 11, 0.75],
        },
      },
      {
        id: "landuse-quarry",
        type: "fill",
        source: "omt",
        "source-layer": "landuse",
        filter: ["==", ["get", "class"], "quarry"],
        paint: {
          "fill-color": PALETTE.rock,
          "fill-opacity": 0.6,
        },
      },
      {
        id: "landuse-urban",
        type: "fill",
        source: "omt",
        "source-layer": "landuse",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["residential", "suburb", "neighbourhood", "commercial", "industrial", "hospital", "school", "railway"]],
        ],
        paint: {
          "fill-color": PALETTE.urban,
          // Subtle opacity so urban settlements blend into the landscape and never form a white sheet
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0, 11, 0.18, 14, 0.26],
        },
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
        layout: { visibility: "visible" },
        paint: {
          "raster-opacity": 1,
          "raster-saturation": 0.08,
          "raster-contrast": 0.08,
          "raster-fade-duration": 200,
        },
      },
      {
        id: HILLSHADE_LAYER,
        type: "hillshade",
        source: HILLSHADE_SOURCE,
        paint: {
          "hillshade-shadow-color": "#181d14",
          "hillshade-highlight-color": "#ffffff",
          "hillshade-accent-color": "#2d3326",
          "hillshade-exaggeration": 0.38,
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
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            ["match", ["get", "class"], "river", 1, 0.4],
            14,
            ["match", ["get", "class"], "river", 2.8, 1.2],
          ],
        },
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
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.8, 12, 4.2, 15, 9.5],
          "line-opacity": 0.85,
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
          "line-color": [
            "match",
            ["get", "class"],
            ["motorway", "trunk", "primary"],
            PALETTE.road,
            ["secondary", "tertiary"],
            PALETTE.roadMinor,
            PALETTE.roadLocal,
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            ["match", ["get", "class"], ["motorway", "trunk", "primary"], 0.7, 0],
            12,
            ["match", ["get", "class"], ["motorway", "trunk", "primary"], 2.8, ["secondary", "tertiary"], 1.8, 0.8],
            15,
            ["match", ["get", "class"], ["motorway", "trunk", "primary"], 7.5, ["secondary", "tertiary"], 5.2, 2.6],
          ],
        },
      },
      {
        id: "building",
        type: "fill",
        source: "omt",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-color": "#6c5f50",
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.35, 15, 0.65],
          "fill-outline-color": "#4d4336",
        },
      },
    ],
    sky: {
      "sky-color": "#9bc4de",
      "horizon-color": "#eddcc2",
      "fog-color": "#e6d7bf",
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
