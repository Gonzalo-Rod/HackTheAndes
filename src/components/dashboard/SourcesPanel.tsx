"use client";

import { SUTRAN_MAP_URL } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { CorridorData } from "@/contracts/corridor";
import type { AlertsMeta } from "@/contracts/road-alerts";
import { formatDateTime } from "@/lib/format";

const FALLBACK_LABELS: Record<AlertsMeta["fallback"], string> = {
  none: "Datos al momento de la consulta",
  cache: "Caché del servidor (SUTRAN no respondió)",
  snapshot: "Instantánea guardada (SUTRAN no respondió)",
};

interface SourcesPanelProps {
  meta: AlertsMeta | null;
  corridor: CorridorData | null;
}

export function SourcesPanel({ meta, corridor }: SourcesPanelProps) {
  return (
    <div className="pr-sources">
      <section className="pr-source">
        <h3>
          <span className="pr-source__kind pr-source__kind--live">Consulta periódica</span>
          Alertas viales · SUTRAN
        </h3>
        <p>
          Alertas vigentes del{" "}
          <a href={SUTRAN_MAP_URL} target="_blank" rel="noopener noreferrer">
            mapa de alertas de SUTRAN <Icon name="external" size={11} />
          </a>
          , leídas desde su API JSON pública (sin autenticación, no documentada). El servidor la consulta como máximo una vez por minuto y el tablero se actualiza
          cada 2 minutos.
        </p>
        <dl className="pr-kv pr-kv--compact">
          <div className="pr-kv__row"><dt>Modo</dt><dd>{meta ? FALLBACK_LABELS[meta.fallback] : "—"}</dd></div>
          <div className="pr-kv__row"><dt>{meta?.fallback === "snapshot" ? "Instantánea guardada" : "Última consulta"}</dt><dd>{meta ? formatDateTime(meta.fetchedAt) : "—"}</dd></div>
          <div className="pr-kv__row"><dt>Última acción SUTRAN</dt><dd>{meta ? formatDateTime(meta.latestActionAt) : "—"}</dd></div>
          <div className="pr-kv__row"><dt>Registros descartados</dt><dd>{meta ? `${meta.skippedCount} (vencidos, no vigentes o inválidos)` : "—"}</dd></div>
        </dl>
      </section>

      <section className="pr-source">
        <h3>
          <span className="pr-source__kind">Capa estática</span>
          Red vial, ríos y regiones
        </h3>
        <p>Red vial nacional del MTC, ríos y quebradas del ANA y límites regionales, tal como los publica el mapa de SUTRAN. Simplificados para su visualización.</p>
        <dl className="pr-kv pr-kv--compact">
          <div className="pr-kv__row"><dt>Descargado</dt><dd>{corridor ? formatDateTime(corridor.metadata.retrievedAt) : "—"}</dd></div>
        </dl>
      </section>

      <section className="pr-source">
        <h3>
          <span className="pr-source__kind">Derivado</span>
          Corredor PE-22 y perfil de elevación
        </h3>
        <p>
          Eje de la Carretera Central armado con los 32 tramos oficiales del MTC; el km se interpola dentro de cada tramo. Elevación de Mapzen Terrain Tiles (AWS,
          ~30 m). Lugares de OpenStreetMap ajustados al eje.
        </p>
      </section>

      <section className="pr-source pr-source--limits">
        <h3>Limitaciones conocidas</h3>
        <ul>
          <li>Si SUTRAN no responde y el servidor no tiene datos recientes, se muestra una instantánea real guardada con su fecha (sin las alertas ya vencidas).</li>
          <li>SUTRAN solo publica alertas vigentes: no hay archivo público de alertas pasadas. La línea de tiempo reproduce las alertas de hoy según su fecha de evento.</li>
          <li>Las fechas de evento no tienen hora; se ubican a las 12:00 (hora de Lima).</li>
          <li>El km publicado por SUTRAN y el km interpolado sobre la geometría del MTC difieren en ~1,5 km en la PE-22.</li>
          <li>Los tramos afectados (±1,2 km) son una aproximación visual, no una extensión oficial.</li>
          <li>Estas alertas son observaciones oficiales confirmadas, no pronósticos de riesgo.</li>
        </ul>
      </section>

      <p className="pr-attrib">
        Mapa base: OpenFreeMap · © OpenMapTiles · © colaboradores de OpenStreetMap. Relieve: Mapzen Terrain Tiles en AWS Open Data. Satélite: Sentinel-2 cloudless
        2016 por EOX (CC BY 4.0).
      </p>
    </div>
  );
}
