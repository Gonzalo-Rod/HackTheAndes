import type { Pool } from "pg";
import { z } from "zod";
import type { RoadContextRequest, RoadContextResponse } from "@peruroad/road-data/context/contracts";
import { roadContextResponseSchema } from "@peruroad/road-data/context/contracts";
import type { ExposureLayer } from "@/contracts/exposure";
import { ExposureLayerSchema } from "@/contracts/exposure";
import { alertCandidateSchema, type AlertCandidate } from "@/contracts/notifications";
import { COMMUNITY_ALERT_CONFIDENCE } from "@/domain/alerts/policy";
/** Matches C's 30-minute complete-poll freshness boundary. */
const OFFICIAL_MAX_AGE_MS = 30 * 60_000;
/** Community evidence expires from notifications after three hours without another report. */
const COMMUNITY_MAX_AGE_MS = 3 * 3_600_000;
export async function collectAlertCandidates(
  deps: {
    pool: Pool;
    context: (i: RoadContextRequest, r: string) => Promise<RoadContextResponse>;
    exposure: () => Promise<ExposureLayer>;
    revision: string;
  },
  nowMs: number,
  requestId: string,
) {
  const candidates: AlertCandidate[] = [];
  const official = roadContextResponseSchema.parse(await deps.context({ kind: "official_alerts" }, requestId));
  if (
    official.kind === "official_alerts" &&
    official.state === "ready" &&
    official.asOf &&
    Date.parse(official.asOf) <= nowMs &&
    nowMs - Date.parse(official.asOf) < OFFICIAL_MAX_AGE_MS
  ) {
    for (const item of official.alerts) {
      const a = item.alert;
      if (!a.location || a.expired || a.notYetValid || a.roadStatus === "unknown") continue;
      const located = roadContextResponseSchema.parse(await deps.context({ kind: "pin", ...a.location }, requestId));
      if (
        located.kind !== "location" ||
        located.state !== "ready" ||
        located.status !== "matched" ||
        !located.location ||
        located.location.geometryRevision !== deps.revision
      )
        continue;
      const km = located.location.distanceFromOriginKm;
      candidates.push({
        key: `sutran:${a.externalId}`,
        fingerprint: `${a.roadStatus}:${a.title.slice(0, 200)}`,
        kind: "official",
        level: a.roadStatus === "interrumpido" ? 3 : a.roadStatus === "restringido" ? 2 : 0,
        startKm: km,
        endKm: km,
        expiresAt: new Date(Date.parse(official.asOf) + OFFICIAL_MAX_AGE_MS).toISOString(),
        text: `SUTRAN: ${a.title.slice(0, 180)} · ${a.roadStatus}. Fuente: ${a.sourceUpdatedAt ?? official.asOf} UTC.`,
        isTest: false,
      });
    }
  }
  const community = await deps.pool.query(
    `select i.id,i.type,i.status,i.is_test as "isTest",i.is_team as "isTeam",i.confidence::float8 as confidence,i.last_confirmed as "lastConfirmed",s.distance_from_origin_start_km::float8 as "startKm",s.distance_from_origin_end_km::float8 as "endKm" from public.incidents i join public.segments s on s.id=i.segment_id where i.origin='community' and s.geometry_revision=$1 and i.last_confirmed>$2 and i.last_confirmed<=$3`,
    [deps.revision, new Date(nowMs - COMMUNITY_MAX_AGE_MS), new Date(nowMs)],
  );
  const rows = z
    .array(
      z.object({
        id: z.uuid(),
        type: z.string().max(40),
        status: z.enum(["active", "clearing", "cleared"]),
        isTest: z.boolean(),
        isTeam: z.boolean(),
        confidence: z.number(),
        lastConfirmed: z.date(),
        startKm: z.number(),
        endKm: z.number(),
      }),
    )
    .parse(community.rows);
  for (const row of rows) {
    if (!row.isTest && (row.isTeam || row.confidence < COMMUNITY_ALERT_CONFIDENCE)) continue;
    // Demonstrations only go to explicit test subscriptions. Production unverified scores do not qualify.
    if (row.status !== "active") continue;
    candidates.push({
      key: `community:${row.id}`,
      fingerprint: `${row.status}:${row.type}`,
      kind: "community",
      level: row.isTest ? 1 : 2,
      startKm: row.startKm,
      endKm: row.endKm,
      expiresAt: new Date(row.lastConfirmed.getTime() + COMMUNITY_MAX_AGE_MS).toISOString(),
      text: `${row.isTest ? "DEMO · " : ""}Comunidad: ${row.type}, NO CONFIRMADO por una autoridad. Reporte: ${row.lastConfirmed.toISOString()} UTC.`,
      isTest: row.isTest,
    });
  }
  const exposure = ExposureLayerSchema.parse(await deps.exposure());
  if (
    exposure.meta.state === "ready" &&
    exposure.meta.storage === "database" &&
    exposure.meta.operationallyUsable &&
    exposure.meta.automatedAlertUse &&
    exposure.data.geometryRevision === deps.revision
  ) {
    const ranks = { routine: 0, watch: 1, priority: 2, high_attention: 3 };
    for (const segment of exposure.data.segments) {
      const window = segment.windows.next24h;
      if (window.state !== "assessed" || !window.category || !window.forecastRain.ok) continue;
      candidates.push({
        key: `exposure:${segment.segmentId}`,
        fingerprint: `${exposure.data.policy.version}:${window.category}`,
        kind: "exposure",
        level: ranks[window.category],
        startKm: segment.distanceFromOriginStartKm,
        endKm: segment.distanceFromOriginEndKm,
        expiresAt: new Date(
          Math.min(
            Date.parse(window.validUntil),
            Date.parse(exposure.data.sources.weatherCapturedAt) + exposure.data.policy.weatherMaxAgeMs,
          ),
        ).toISOString(),
        text: `Exposición climática ESTIMADA (${window.category}), eje ${segment.distanceFromOriginStartKm.toFixed(1)}–${segment.distanceFromOriginEndKm.toFixed(1)} km: lluvia modelada ${window.forecastRain.precipitationMm.toFixed(1)} mm/24 h y susceptibilidad INGEMMET. Captura ${exposure.data.sources.weatherCapturedAt}, ventana hasta ${window.validUntil}. Reglas experimentales; asociación de cuenca aproximada.`,
        isTest: false,
      });
    }
  }
  return z.array(alertCandidateSchema).parse(candidates);
}
