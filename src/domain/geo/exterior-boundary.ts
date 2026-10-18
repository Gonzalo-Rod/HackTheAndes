type LngLat = [number, number];

type PolygonGeometry = { type: "Polygon"; coordinates: LngLat[][] } | { type: "MultiPolygon"; coordinates: LngLat[][][] };

type PolygonFeature = { type: "Feature"; geometry: PolygonGeometry; properties?: Record<string, unknown> | null };

function coordinateKey([longitude, latitude]: LngLat): string {
  return `${longitude},${latitude}`;
}

/** Drops shared department edges so the remaining segments form Peru's outer perimeter. */
export function exteriorBoundarySegments(features: readonly PolygonFeature[]): GeoJSON.Feature<GeoJSON.MultiLineString> {
  const edges = new Map<string, { coordinates: [LngLat, LngLat]; count: number }>();

  for (const feature of features) {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) {
      const ring = polygon[0];
      if (!ring) continue;
      for (let index = 0; index < ring.length - 1; index += 1) {
        const start: LngLat = [ring[index][0], ring[index][1]];
        const end: LngLat = [ring[index + 1][0], ring[index + 1][1]];
        if (start[0] === end[0] && start[1] === end[1]) continue;
        const startKey = coordinateKey(start);
        const endKey = coordinateKey(end);
        const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
        const edge = edges.get(key);
        if (edge) edge.count += 1;
        else edges.set(key, { coordinates: [start, end], count: 1 });
      }
    }
  }

  const boundary = [...edges.values()].filter((edge) => edge.count === 1).map((edge) => edge.coordinates);
  if (!boundary.length || [...edges.values()].some((edge) => edge.count > 2)) {
    throw new Error("Department geometries do not form a valid national boundary.");
  }

  return {
    type: "Feature",
    properties: { name: "Perú" },
    geometry: { type: "MultiLineString", coordinates: boundary },
  };
}
