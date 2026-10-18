// Builds the static map layers served from public/data/ (run: npm run data:build [-- --refresh]).
//
// Sources (public, no credentials). The SUTRAN CDN URLs come from the configuration of
// the public SUTRAN alert map (alertasviales.sutran.gob.pe):
//   - Road network:  MTC network as served by SUTRAN (geometry on CloudFront + segment attributes)
//   - Hydrography:   ANA rivers and quebradas as served by SUTRAN
//   - Regions:       region boundaries served by SUTRAN
//   - Elevation:     AWS Terrain Tiles (Terrarium encoding)
//   - Places:        OpenStreetMap Nominatim (1 request per second, cached)
// Raw downloads are cached in scripts/.cache/ (git-ignored).

import fs from "node:fs/promises";
import path from "node:path";

import { PNG } from "pngjs";

import type { CorridorData } from "../src/contracts/corridor";
import { buildMeasuredCorridor } from "../src/domain/geo/corridor-builder";
import { exteriorBoundarySegments } from "../src/domain/geo/exterior-boundary";
import { haversineKm, pointAtKm, projectOnMeasuredLine, type LngLat, type MeasuredVertex } from "../src/domain/geo/measure";
import { dedupeConsecutive, roundCoord, simplifyLine } from "../src/domain/geo/simplify";
import { regionKey } from "../src/domain/road-alerts/parsing";
import { getArrayBuffer, getJson, type RequestOptions } from "../src/integrations/http/fetch-json";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, "scripts", ".cache");
const OUT_DIR = path.join(ROOT, "public", "data");
const REFRESH = process.argv.includes("--refresh");
const SUTRAN_API = "https://api.sigea.sutran.gob.pe/public";
const SOURCES = {
  segments: `${SUTRAN_API}/road-network/segments?red=nacional`,
  network: "https://d27ijeauab3idp.cloudfront.net/red-vial-nacional.geojson",
  hydroAttrs: `${SUTRAN_API}/hydrography`,
  hydro: "https://d1nmqibi58phlc.cloudfront.net/rios-quebradas-peru.geojson",
  regions: "https://d9mp4qxb85s04.cloudfront.net/regiones-peru.geojson",
  alerts: `${SUTRAN_API}/alerts`,
  nominatim: "https://nominatim.openstreetmap.org/search",
  terrarium: (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
};
const HTTP: Omit<RequestOptions, "provider" | "operation"> = {
  timeoutMs: 60_000,
  headers: { "User-Agent": "PeruRoadClimate/0.1 (Hack the Andes 2026 prototype; static layer build)", "Accept-Language": "es" },
};

// Display tolerances (degrees) chosen to keep each layer near or below 1–2 MB uncompressed.
const NETWORK_TOLERANCE_DEG = 0.0012;
const RIVERS_TOLERANCE_DEG = 0.002;
const REGIONS_TOLERANCE_DEG = 0.004;
/** Nominatim's 1 request/second usage policy, with margin. */
const NOMINATIM_DELAY_MS = 1100;
/** A geocoded town further than this from the road axis is rejected as a mismatch. */
const MAX_PLACE_OFFSET_KM = 3;
/** z12 Terrarium tiles give ~30 m pixels at this latitude, finer than needed for a 175 km profile. */
const TERRAIN_ZOOM = 12;
const PROFILE_STEP_KM = 0.5;
const KM_MARKER_STEP = 10;
const CORRIDOR_MIN_VERTEX_SPACING_KM = 0.04;

const PE22_PLACES = [
  ["Ate", "Ate, Lima, Perú"],
  ["Chaclacayo", "Chaclacayo, Lima, Perú"],
  ["Chosica", "Chosica, Lurigancho, Lima, Perú"],
  ["Ricardo Palma", "Ricardo Palma, Huarochirí, Lima, Perú"],
  ["Cocachacra", "Cocachacra, Huarochirí, Lima, Perú"],
  ["San Bartolomé", "San Bartolomé, Huarochirí, Lima, Perú"],
  ["Matucana", "Matucana, Huarochirí, Lima, Perú"],
  ["San Mateo", "San Mateo de Huanchor, Huarochirí, Lima, Perú"],
  ["Chicla", "Chicla, Huarochirí, Lima, Perú"],
  ["Casapalca", "Casapalca, Huarochirí, Lima, Perú"],
  ["Ticlio", "Ticlio, Perú"],
  ["Morococha", "Morococha, Yauli, Junín, Perú"],
  ["La Oroya", "La Oroya, Yauli, Junín, Perú"],
] as const;

type Geometry = { type: string; coordinates: unknown };
type Feature = { type: "Feature"; geometry: Geometry; properties: Record<string, unknown> };
type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };
type Envelope<T> = { data: T };
type SegmentAttrs = {
  id: string;
  codVia: string;
  kmInicio: number;
  kmFin: number;
  superficie: string | null;
  estado: string | null;
  nombreVia: string;
};
type HydroAttrs = { id: string; nombre: string; tipo: string; cuenca: string };
type NominatimHit = { lat: string; lon: string; category: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
const exists = (file: string) =>
  fs.access(file).then(
    () => true,
    () => false,
  );

async function cachedJson<T>(name: string, url: string): Promise<T> {
  const file = path.join(CACHE_DIR, name);
  if (!REFRESH && (await exists(file))) return JSON.parse(await fs.readFile(file, "utf8")) as T;
  console.log(`  ↓ ${url}`);
  const body = await getJson(url, { ...HTTP, provider: new URL(url).host, operation: "data-build.download" });
  await fs.writeFile(file, JSON.stringify(body));
  return body as T;
}

async function cachedBuffer(name: string, url: string): Promise<Buffer> {
  const file = path.join(CACHE_DIR, name);
  if (!REFRESH && (await exists(file))) return fs.readFile(file);
  const buffer = Buffer.from(await getArrayBuffer(url, { ...HTTP, provider: "aws-terrain-tiles", operation: "data-build.terrain" }));
  await fs.writeFile(file, buffer);
  return buffer;
}

async function writeJson(name: string, data: unknown) {
  const text = JSON.stringify(data);
  await fs.writeFile(path.join(OUT_DIR, name), text);
  console.log(`  ✓ public/data/${name} (${Math.round(text.length / 1024)} KB)`);
}

function lineParts(geometry: Geometry): LngLat[][] {
  return (geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates) as LngLat[][];
}

function simplifiedLines(geometry: Geometry, toleranceDeg: number): Geometry | null {
  const lines = lineParts(geometry)
    .map((line) => dedupeConsecutive(simplifyLine(line, toleranceDeg).map((c) => roundCoord(c, 4))))
    .filter((line) => line.length >= 2);
  if (!lines.length) return null;
  return lines.length === 1 ? { type: "LineString", coordinates: lines[0] } : { type: "MultiLineString", coordinates: lines };
}

function simplifiedPolygons(geometry: Geometry): { geometry: Geometry; bbox: number[] } {
  const polygons = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates) as LngLat[][][];
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  const simplified = polygons
    .map((rings) =>
      rings
        .map((ring) => dedupeConsecutive(simplifyLine(ring, REGIONS_TOLERANCE_DEG).map((c) => roundCoord(c, 4))))
        .filter((ring) => ring.length >= 4),
    )
    .filter((rings) => rings.length > 0);
  for (const [lng, lat] of simplified.flat(2)) {
    bbox[0] = Math.min(bbox[0], lng);
    bbox[1] = Math.min(bbox[1], lat);
    bbox[2] = Math.max(bbox[2], lng);
    bbox[3] = Math.max(bbox[3], lat);
  }
  return {
    geometry: simplified.length === 1 ? { type: "Polygon", coordinates: simplified[0] } : { type: "MultiPolygon", coordinates: simplified },
    bbox: bbox.map((v) => round(v, 3)),
  };
}

const terrainTiles = new Map<string, Promise<PNG>>();

async function elevationAt([lng, lat]: LngLat): Promise<number> {
  const n = 2 ** TERRAIN_ZOOM;
  const xf = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const [x, y] = [Math.floor(xf), Math.floor(yf)];
  const key = `${x}-${y}`;
  if (!terrainTiles.has(key)) {
    terrainTiles.set(
      key,
      cachedBuffer(`terrarium-${TERRAIN_ZOOM}-${key}.png`, SOURCES.terrarium(TERRAIN_ZOOM, x, y)).then((b) => PNG.sync.read(b)),
    );
  }
  const png = await (terrainTiles.get(key) as Promise<PNG>);
  const px = Math.min(255, Math.floor((xf - x) * 256));
  const py = Math.min(255, Math.floor((yf - y) * 256));
  const i = (py * png.width + px) * 4;
  // Terrarium encoding: elevation = R × 256 + G + B / 256 − 32768 (metres).
  return png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
}

async function geocodePlaces(line: MeasuredVertex[]): Promise<CorridorData["places"]> {
  const places: CorridorData["places"] = [];
  for (const [name, query] of PE22_PLACES) {
    const slug = name
      .normalize("NFD")
      .replace(/[^\w]+/g, "-")
      .toLowerCase();
    const cacheName = `nominatim-${slug}-candidates.json`;
    const wasCached = await exists(path.join(CACHE_DIR, cacheName));
    const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "6", countrycodes: "pe" });
    const hits = await cachedJson<NominatimHit[]>(cacheName, `${SOURCES.nominatim}?${params}`);
    if (!wasCached || REFRESH) await sleep(NOMINATIM_DELAY_MS);
    // Prefer settlement nodes over administrative centroids; disambiguate homonyms by proximity to the road.
    const settlements = hits.filter((hit) => hit.category === "place");
    const projections = (settlements.length ? settlements : hits).map((hit) =>
      projectOnMeasuredLine([Number(hit.lon), Number(hit.lat)], line),
    );
    const best = projections.sort((a, b) => a.distanceKm - b.distanceKm)[0];
    const accepted = best !== undefined && best.distanceKm <= MAX_PLACE_OFFSET_KM;
    console.log(
      `    ${accepted ? "✓" : "✗"} ${name}: ${best ? `km ${best.km.toFixed(1)}, ${best.distanceKm.toFixed(2)} km from the axis` : "not found"}`,
    );
    if (!accepted) continue;
    places.push({
      name,
      km: round(best.km, 1),
      lng: round(best.coord[0], 5),
      lat: round(best.coord[1], 5),
      offsetKm: round(best.distanceKm, 2),
      elevationM: Math.round(await elevationAt(best.coord)),
    });
  }
  return places.sort((a, b) => a.km - b.km);
}

async function buildCorridor(network: FeatureCollection, segmentById: Map<string, SegmentAttrs>, retrievedAt: string) {
  const pe22 = network.features
    .map((feature) => ({ feature, attrs: segmentById.get(String(feature.properties.id)) }))
    .filter((item): item is { feature: Feature; attrs: SegmentAttrs } => item.attrs?.codVia === "PE-22");
  const { line, maxGapKm } = buildMeasuredCorridor(
    pe22.map(({ feature, attrs }) => ({ kmStart: attrs.kmInicio, kmEnd: attrs.kmFin, parts: lineParts(feature.geometry) })),
  );
  if (line.length < 2) throw new Error("PE-22 geometry could not be assembled");
  const kmTotal = line[line.length - 1][2];
  console.log(`  ${pe22.length} segments, km 0–${kmTotal.toFixed(1)}, largest gap ${(maxGapKm * 1000).toFixed(0)} m`);

  const thinned: MeasuredVertex[] = [];
  for (const vertex of line) {
    const previous = thinned[thinned.length - 1];
    if (previous && haversineKm([previous[0], previous[1]], [vertex[0], vertex[1]]) < CORRIDOR_MIN_VERTEX_SPACING_KM) continue;
    thinned.push([round(vertex[0], 5), round(vertex[1], 5), round(vertex[2], 3)]);
  }

  console.log("  Elevation profile…");
  const profile: CorridorData["profile"] = [];
  for (let km = 0; km <= kmTotal; km += PROFILE_STEP_KM) {
    profile.push({ km: round(km, 1), elevationM: Math.round(await elevationAt(pointAtKm(line, km))) });
  }

  console.log("  Places (Nominatim)…");
  const corridor: CorridorData = {
    road: "PE-22",
    name: "Carretera Central",
    kmTotal: round(kmTotal, 3),
    line: thinned,
    segments: pe22
      .map(({ attrs }) => ({
        kmStart: round(attrs.kmInicio, 3),
        kmEnd: round(attrs.kmFin, 3),
        surface: attrs.superficie ?? "Sin dato",
        condition: attrs.estado ?? "Sin dato",
      }))
      .sort((a, b) => a.kmStart - b.kmStart),
    kmMarkers: Array.from({ length: Math.floor(kmTotal / KM_MARKER_STEP) + 1 }, (_, i) => {
      const [lng, lat] = pointAtKm(line, i * KM_MARKER_STEP);
      return { km: i * KM_MARKER_STEP, lng: round(lng, 5), lat: round(lat, 5) };
    }),
    places: await geocodePlaces(line),
    profile,
    metadata: {
      retrievedAt,
      geometry:
        "MTC network segments for PE-22 (via SUTRAN), chained and measured by linear interpolation of each segment's official km range",
      elevation: "AWS Terrain Tiles (Terrarium, z12, ~30 m at this latitude), sampled every 0.5 km",
      places: "OpenStreetMap Nominatim settlements snapped to the PE-22 axis; positions are approximate",
      attribution: [
        "Red vial: MTC vía SUTRAN",
        "Elevación: Mapzen Terrain Tiles (SRTM, GMTED, ETOPO1 y otras fuentes) en AWS Open Data",
        "Lugares: © colaboradores de OpenStreetMap (ODbL)",
      ],
    },
  };
  await writeJson("pe22.json", corridor);
  return line;
}

async function checkAlertKm(line: MeasuredVertex[]) {
  console.log("Current SUTRAN PE-22 alerts vs. the measured corridor:");
  const body = (await getJson(SOURCES.alerts, {
    ...HTTP,
    timeoutMs: 15_000,
    provider: "sutran",
    operation: "data-build.alerts",
  })) as Envelope<{ codigo: string; km: string; lat: number; lng: number; viaCodigo: string }[]>;
  for (const alert of body.data.filter((a) => a.viaCodigo === "PE-22")) {
    const p = projectOnMeasuredLine([alert.lng, alert.lat], line);
    console.log(
      `  ${alert.codigo}: stated "${alert.km}" → geometry km ${p.km.toFixed(1)}, ${(p.distanceKm * 1000).toFixed(0)} m from the axis`,
    );
  }
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(OUT_DIR, { recursive: true });
  const retrievedAt = new Date().toISOString();

  console.log("Downloading sources…");
  const segments = await cachedJson<Envelope<SegmentAttrs[]>>("segments-nacional.json", SOURCES.segments);
  const network = await cachedJson<FeatureCollection>("red-vial-nacional.geojson", SOURCES.network);
  const hydroAttrs = await cachedJson<Envelope<HydroAttrs[]>>("hydrography.json", SOURCES.hydroAttrs);
  const hydro = await cachedJson<FeatureCollection>("rios-quebradas-peru.geojson", SOURCES.hydro);
  const regions = await cachedJson<FeatureCollection>("regiones-peru.geojson", SOURCES.regions);

  console.log("National road network…");
  const segmentById = new Map(segments.data.map((s) => [s.id, s]));
  const networkFeatures: Feature[] = [];
  for (const feature of network.features) {
    const attrs = segmentById.get(String(feature.properties.id));
    const geometry = attrs ? simplifiedLines(feature.geometry, NETWORK_TOLERANCE_DEG) : null;
    if (!attrs || !geometry) continue;
    networkFeatures.push({
      type: "Feature",
      geometry,
      properties: { road: attrs.codVia, condition: attrs.estado ?? "Sin dato", surface: attrs.superficie ?? "Sin dato" },
    });
  }
  await writeJson("red-vial-nacional.geojson", {
    type: "FeatureCollection",
    metadata: {
      source: "MTC national road network as served by SUTRAN",
      geometryUrl: SOURCES.network,
      attributesUrl: SOURCES.segments,
      retrievedAt,
    },
    features: networkFeatures,
  });

  console.log("PE-22 corridor…");
  const line = await buildCorridor(network, segmentById, retrievedAt);

  console.log("Rivers and quebradas…");
  const hydroById = new Map(hydroAttrs.data.map((h) => [String(h.id), h]));
  const hydroFeatures: Feature[] = [];
  for (const feature of hydro.features) {
    const attrs = hydroById.get(String(feature.properties.id));
    const geometry = attrs ? simplifiedLines(feature.geometry, RIVERS_TOLERANCE_DEG) : null;
    if (!attrs || !geometry) continue;
    hydroFeatures.push({ type: "Feature", geometry, properties: { name: attrs.nombre, kind: attrs.tipo, basin: attrs.cuenca } });
  }
  await writeJson("rios-quebradas.geojson", {
    type: "FeatureCollection",
    metadata: { source: "ANA hydrography as served by SUTRAN", geometryUrl: SOURCES.hydro, attributesUrl: SOURCES.hydroAttrs, retrievedAt },
    features: hydroFeatures,
  });

  console.log("Regions…");
  const regionFeatures = regions.features.map((feature) => {
    const { geometry, bbox } = simplifiedPolygons(feature.geometry);
    return { type: "Feature" as const, geometry, properties: { key: regionKey(String(feature.properties.departamento ?? "")), bbox } };
  });
  await writeJson("regiones.geojson", {
    type: "FeatureCollection",
    metadata: { source: "Region boundaries served by SUTRAN", url: SOURCES.regions, retrievedAt },
    features: regionFeatures,
  });
  const polygonFeatures = regionFeatures.map(({ geometry }) => {
    if (geometry.type === "Polygon") {
      return { type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: geometry.coordinates as LngLat[][] } };
    }
    if (geometry.type === "MultiPolygon") {
      return {
        type: "Feature" as const,
        geometry: { type: "MultiPolygon" as const, coordinates: geometry.coordinates as LngLat[][][] },
      };
    }
    throw new Error("Region source must contain polygon geometries.");
  });
  await writeJson("peru-outline.geojson", {
    type: "FeatureCollection",
    metadata: {
      source: "Exterior perimeter derived from the SUTRAN department boundaries; shared department edges removed",
      url: SOURCES.regions,
      retrievedAt,
    },
    features: [exteriorBoundarySegments(polygonFeatures)],
  });

  await checkAlertKm(line);
  console.log("Done.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
