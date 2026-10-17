"use client";

import { SUTRAN_MAP_URL } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { CorridorData } from "@/contracts/corridor";
import type { AlertsMeta } from "@/contracts/road-alerts";
import type { CorridorRainResponse } from "@/contracts/weather";
import { formatDateTime } from "@/lib/format";

const FALLBACK_LABELS: Record<AlertsMeta["fallback"], string> = {
  none: "Datos al momento de la consulta",
  cache: "Caché del servidor (SUTRAN no respondió)",
  snapshot: "Instantánea guardada (SUTRAN no respondió)",
};

interface SourcesPanelProps {
  meta: AlertsMeta | null;
  corridor: CorridorData | null;
  rain: CorridorRainResponse | null;
}

export function SourcesPanel({ meta, corridor, rain }: SourcesPanelProps) {
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
          , leídas desde su API JSON pública (sin autenticación, no documentada). El servidor la consulta como máximo una vez por minuto y
          el tablero se actualiza cada 2 minutos.
        </p>
        <dl className="pr-kv pr-kv--compact">
          <div className="pr-kv__row">
            <dt>Modo</dt>
            <dd>{meta ? FALLBACK_LABELS[meta.fallback] : "—"}</dd>
          </div>
          <div className="pr-kv__row">
            <dt>{meta?.fallback === "snapshot" ? "Instantánea guardada" : "Última consulta"}</dt>
            <dd>{meta ? formatDateTime(meta.fetchedAt) : "—"}</dd>
          </div>
          <div className="pr-kv__row">
            <dt>Última acción SUTRAN</dt>
            <dd>{meta ? formatDateTime(meta.latestActionAt) : "—"}</dd>
          </div>
          <div className="pr-kv__row">
            <dt>Registros descartados</dt>
            <dd>{meta ? `${meta.skippedCount} (vencidos, no vigentes o inválidos)` : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="pr-source">
        <h3>
          <span className="pr-source__kind pr-source__kind--live">Consulta periódica</span>
          Lluvia en la PE-22 · Open-Meteo
        </h3>
        <p>
          Precipitación por hora en {rain ? rain.samples.length : 9} puntos equidistantes del eje, del pronóstico de Open-Meteo (modelos
          globales, malla de varios km). Cada tramo toma el valor del punto más cercano y se colorea con el mayor valor entre las últimas y
          las próximas 24 h completas, ancladas a la hora UTC de la consulta. El pasado también es una estimación de modelo, no una
          observación. El servidor consulta como máximo cada 30 minutos; datos horarios incompletos activan caché o un estado no disponible.
        </p>
        <dl className="pr-kv pr-kv--compact">
          <div className="pr-kv__row">
            <dt>Última consulta</dt>
            <dd>{rain ? formatDateTime(rain.fetchedAt) : "—"}</dd>
          </div>
          <div className="pr-kv__row">
            <dt>Estado</dt>
            <dd>{rain ? (rain.stale ? "Open-Meteo no respondió; se muestran los últimos datos" : "Al día") : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="pr-source">
        <h3>
          <span className="pr-source__kind">Capa estática</span>
          Red vial, ríos y regiones
        </h3>
        <p>
          Red vial nacional del MTC, ríos y quebradas del ANA y límites regionales, tal como los publica el mapa de SUTRAN. Simplificados
          para su visualización.
        </p>
        <dl className="pr-kv pr-kv--compact">
          <div className="pr-kv__row">
            <dt>Descargado</dt>
            <dd>{corridor ? formatDateTime(corridor.metadata.retrievedAt) : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="pr-source">
        <h3>
          <span className="pr-source__kind">Derivado</span>
          Corredor PE-22 y perfil de elevación
        </h3>
        <p>
          {corridor?.metadata.geometry} {corridor?.metadata.elevation} {corridor?.metadata.places}
          {corridor?.metadata.message}
        </p>
      </section>

      <section className="pr-source">
        <h3>Cuencas aproximadas</h3>
        <p>
          HydroBASINS nivel 12 y topología aguas arriba, asociados a intersecciones cartográficas de ríos y carretera. Incluyen la parte de
          la subcuenca situada aguas abajo del cruce: no son delimitaciones precisas al punto vial. Confianza baja; no representan un nivel
          de riesgo.
        </p>
        <p>
          <a
            href="https://data.hydrosheds.org/file/technical-documentation/HydroSHEDS_TechDoc_v1_4.pdf#page=29"
            target="_blank"
            rel="noreferrer"
          >
            HydroBASINS / HydroSHEDS © WWF · fuente y licencia
          </a>
          . Lehner y Grill (2013), doi:10.1002/hyp.9740. WWF no ha evaluado esta derivación y no ofrece garantía de precisión, integridad o
          adecuación.
        </p>
      </section>
      <section className="pr-source pr-source--limits">
        <h3>Limitaciones conocidas</h3>
        <ul>
          <li>
            Si SUTRAN no responde y el servidor no tiene datos recientes, se muestra una instantánea real guardada con su fecha (sin las
            alertas ya vencidas).
          </li>
          <li>
            SUTRAN solo publica alertas vigentes: no hay archivo público de alertas pasadas. La línea de tiempo reproduce las alertas de hoy
            según su fecha de evento.
          </li>
          <li>Las fechas de evento no tienen hora; se ubican a las 12:00 (hora de Lima).</li>
          <li>La distancia medida desde el origen geométrico no equivale al km oficial; la calibración sigue sin verificar.</li>
          <li>Los tramos afectados (±1,2 km) son una aproximación visual, no una extensión oficial.</li>
          <li>
            Las alertas SUTRAN son oficiales. Los reportes comunitarios se etiquetan como no confirmados. No son pronósticos de riesgo.
          </li>
          <li>
            La lluvia es un pronóstico de modelo, no una medición de estaciones ni un aviso de SENAMHI. Muestra intensidad de lluvia, no el
            riesgo de huaicos o derrumbes, y en la sierra puede diferir bastante entre quebradas cercanas.
          </li>
        </ul>
      </section>

      <p className="pr-attrib">
        Mapa base: OpenFreeMap · © OpenMapTiles · © colaboradores de OpenStreetMap. Relieve: Mapzen Terrain Tiles en AWS Open Data.
        Satélite: Sentinel-2 cloudless 2016 por EOX (CC BY 4.0). Lluvia: datos meteorológicos de Open-Meteo.com (CC BY 4.0).
      </p>
    </div>
  );
}
