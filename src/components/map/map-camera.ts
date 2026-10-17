import type { LngLatBoundsLike, Map as MLMap } from "maplibre-gl";

import type { MapMode } from "@/components/dashboard/types";
import type { CorridorData } from "@/contracts/corridor";
import { bearingDeg, pointAtKm, type LngLat } from "@/domain/geo/measure";

export const PERU_BOUNDS: LngLatBoundsLike = [
  [-81.4, -18.4],
  [-68.6, -0.05],
];

/** The tour covers the 175 km corridor in ~34 s (≈5 km/s), slow enough to read the profile. */
const TOUR_DURATION_MS = 34_000;
/** Wide enough for terrain tiles to keep up with the camera on modest GPUs. */
const TOUR_ZOOM = 11.8;
const TOUR_PITCH = 60;
/** The camera looks this far ahead along the road so turns read smoothly. */
const TOUR_LOOKAHEAD_KM = 4.5;
const TOUR_BEARING_SMOOTHING = 0.03;
const TOUR_PROGRESS_STEP_KM = 0.3;
const ORBIT_DEG_PER_MS = 0.012;
const ALERT_ZOOM = 12.4;

/** Screen-space padding (px) that keeps targets clear of overlays. */
export interface ScreenPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface CameraDeps {
  getPadding: () => ScreenPadding;
  getMode: () => MapMode;
  getCorridor: () => CorridorData | null;
  onTourProgress: (km: number | null) => void;
  onTourChange: (active: boolean) => void;
  onOrbitChange: (active: boolean) => void;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Padding is never passed to flyTo/easeTo: MapLibre would keep it as persistent map padding and
// cameraForBounds would subtract it a second time. Point targets use a center offset instead.
function offsetFor(padding: ScreenPadding): [number, number] {
  return [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2];
}
const duration = (ms: number) => (reducedMotion() ? 0 : ms);

function lerpAngle(from: number, to: number, t: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return from + delta * t;
}

export function createCameraController(map: MLMap, deps: CameraDeps) {
  let tour: { raf: number } | null = null;
  let orbit: { raf: number } | null = null;
  const pitchFor = (pitch3d: number) => (deps.getMode() === "3d" ? pitch3d : 0);

  function stopTour() {
    if (!tour) return;
    cancelAnimationFrame(tour.raf);
    tour = null;
    deps.onTourProgress(null);
    deps.onTourChange(false);
  }

  function stopOrbit() {
    if (!orbit) return;
    cancelAnimationFrame(orbit.raf);
    orbit = null;
    deps.onOrbitChange(false);
  }

  function stopAll() {
    stopTour();
    stopOrbit();
  }

  function flyToBoundsLike(bounds: LngLatBoundsLike, pitch: number, bearing = 0) {
    const camera = map.cameraForBounds(bounds, { padding: deps.getPadding(), bearing });
    if (camera) map.flyTo({ ...camera, pitch, bearing, duration: duration(2200), essential: true });
  }

  function runTour(corridor: CorridorData) {
    const { line, kmTotal } = corridor;
    let smoothedBearing = bearingDeg(pointAtKm(line, 0), pointAtKm(line, 3));
    const state = { raf: 0 };
    tour = state;
    deps.onTourChange(true);
    deps.onTourProgress(0);
    map.flyTo({ center: pointAtKm(line, 0), zoom: TOUR_ZOOM, pitch: TOUR_PITCH, bearing: smoothedBearing, duration: 2400, essential: true });
    map.once("moveend", () => {
      if (tour !== state) return;
      const startMs = performance.now();
      let lastReportedKm = -1;
      const frame = (nowMs: number) => {
        if (tour !== state) return;
        const progress = Math.min(1, (nowMs - startMs) / TOUR_DURATION_MS);
        const km = progress * kmTotal;
        const center = pointAtKm(line, km);
        if (km < kmTotal - 0.5) {
          smoothedBearing = lerpAngle(smoothedBearing, bearingDeg(center, pointAtKm(line, Math.min(kmTotal, km + TOUR_LOOKAHEAD_KM))), TOUR_BEARING_SMOOTHING);
        }
        map.jumpTo({ center, bearing: smoothedBearing, pitch: TOUR_PITCH, zoom: TOUR_ZOOM });
        if (Math.abs(km - lastReportedKm) >= TOUR_PROGRESS_STEP_KM) {
          lastReportedKm = km;
          deps.onTourProgress(km);
        }
        if (progress < 1) state.raf = requestAnimationFrame(frame);
        else stopTour();
      };
      state.raf = requestAnimationFrame(frame);
    });
  }

  return {
    stopAll,
    stopTour,
    flyToPeru() {
      stopAll();
      flyToBoundsLike(PERU_BOUNDS, 0);
    },
    flyToCorridor() {
      const corridor = deps.getCorridor();
      if (!corridor) return;
      stopAll();
      const lngs = corridor.line.map((v) => v[0]);
      const lats = corridor.line.map((v) => v[1]);
      const first = corridor.line[0];
      const last = corridor.line[corridor.line.length - 1];
      // Look across the valley: perpendicular to the overall Lima → La Oroya direction.
      const heading = bearingDeg([first[0], first[1]], [last[0], last[1]]) - 90;
      flyToBoundsLike(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        pitchFor(52),
        heading,
      );
    },
    flyToAlert(center: LngLat) {
      stopAll();
      map.flyTo({
        center,
        zoom: Math.max(map.getZoom(), ALERT_ZOOM),
        pitch: pitchFor(62),
        bearing: deps.getMode() === "3d" ? map.getBearing() : 0,
        offset: offsetFor(deps.getPadding()),
        duration: duration(2200),
        essential: true,
      });
    },
    flyToBounds(bbox: [number, number, number, number]) {
      stopAll();
      flyToBoundsLike(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        pitchFor(40),
      );
    },
    flyToKm(km: number) {
      const corridor = deps.getCorridor();
      if (!corridor) return;
      stopAll();
      const center = pointAtKm(corridor.line, km);
      const ahead = pointAtKm(corridor.line, Math.min(km + 3, corridor.kmTotal));
      map.flyTo({
        center,
        zoom: 12.2,
        pitch: pitchFor(62),
        bearing: deps.getMode() === "3d" ? bearingDeg(center, ahead) : 0,
        offset: offsetFor(deps.getPadding()),
        duration: duration(2000),
        essential: true,
      });
    },
    startTour() {
      const corridor = deps.getCorridor();
      if (!corridor) return;
      stopAll();
      runTour(corridor);
    },
    setOrbit(on: boolean, center?: LngLat) {
      stopAll();
      if (!on || reducedMotion()) return;
      if (deps.getMode() === "3d" && map.getPitch() < 45) map.easeTo({ pitch: 60, duration: 600 });
      const state = { raf: 0 };
      orbit = state;
      deps.onOrbitChange(true);
      let lastMs = performance.now();
      const frame = (nowMs: number) => {
        if (orbit !== state) return;
        map.jumpTo({ bearing: map.getBearing() + (nowMs - lastMs) * ORBIT_DEG_PER_MS, ...(center ? { center } : {}) });
        lastMs = nowMs;
        state.raf = requestAnimationFrame(frame);
      };
      state.raf = requestAnimationFrame(frame);
    },
    resetNorth() {
      map.easeTo({ bearing: 0, pitch: deps.getMode() === "3d" ? map.getPitch() : 0, duration: 700 });
    },
    zoomBy(delta: number) {
      map.easeTo({ zoom: map.getZoom() + delta, duration: 300 });
    },
  };
}

export type CameraController = ReturnType<typeof createCameraController>;
