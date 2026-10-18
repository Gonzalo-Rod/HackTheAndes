import type { CorridorData } from "@/contracts/corridor";
import type { SegmentCollection } from "@/contracts/platform";
import { haversineKm, pointAtKm, projectOnMeasuredLine, type MeasuredVertex } from "./measure";

export function buildDatabaseCorridor(collection: SegmentCollection, bundled: CorridorData): CorridorData {
  if (!collection.features.length) throw new Error("No corridor segments available");
  const line: MeasuredVertex[] = [];
  const profile: CorridorData["profile"] = [];
  for (const segment of collection.features) {
    const { startDistanceKm, endDistanceKm, elevationM } = segment.properties;
    const coordinates = segment.geometry.coordinates;
    const distances = [0];
    for (let index = 1; index < coordinates.length; index++)
      distances.push(distances[index - 1] + haversineKm(coordinates[index - 1], coordinates[index]));
    const totalKm = distances[distances.length - 1];
    if (totalKm <= 0) throw new Error("Zero-length corridor segment");
    coordinates.forEach(([lng, lat], index) => {
      // Keep C's segment boundaries exact, with geodesic interpolation within each segment.
      const km = startDistanceKm + (distances[index] / totalKm) * (endDistanceKm - startDistanceKm);
      if (!line.length || km > line[line.length - 1][2]) line.push([lng, lat, km]);
    });
    if (elevationM !== null) profile.push({ km: (startDistanceKm + endDistanceKm) / 2, elevationM });
  }
  if (profile.length < 2) throw new Error("Terrain estimates unavailable");
  const kmTotal = collection.features[collection.features.length - 1].properties.endDistanceKm;
  return {
    ...bundled,
    line,
    kmTotal,
    segments: collection.features.map(({ properties: p }) => ({
      kmStart: p.startDistanceKm,
      kmEnd: p.endDistanceKm,
      surface: "Sin verificar",
      condition: "Sin verificar",
    })),
    kmMarkers: Array.from({ length: Math.floor(kmTotal / 10) + 1 }, (_, index) => {
      const km = index * 10;
      const [lng, lat] = pointAtKm(line, km);
      return { km, lng, lat };
    }),
    places: bundled.places.map((place) => ({ ...place, km: projectOnMeasuredLine([place.lng, place.lat], line).km })),
    profile,
    metadata: {
      ...bundled.metadata,
      retrievedAt: collection.retrievedAt,
      geometry: "MTC/SUTRAN geometry from Supabase; geodesic distance from origin. Official kilometer calibration is unverified.",
      elevation: "Open-Meteo Copernicus DEM 90 m, sampled at segment midpoints. Terrain estimates, not surveyed road elevations.",
      geometryRevision: collection.geometryRevision,
      state: "database",
      message: "Distancia desde el origen geométrico; no son hitos kilométricos oficiales.",
    },
  };
}
