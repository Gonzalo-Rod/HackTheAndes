"use client";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { CorridorPlace } from "@/contracts/corridor";
import { ROUTE_WATCH_PERIOD_HOURS, RouteWatchCreatedSchema, RouteWatchListSchema, type RouteWatch } from "@/contracts/route-watch";
import { nearestPlace } from "@/domain/road-alerts/corridor-placement";
import { fetchCorridor } from "@/integrations/dashboard-api/client";
import { cancelRouteWatch, postDashboard } from "@/integrations/dashboard-api/write";
import { getJson } from "@/integrations/http/fetch-json";
import { formatDateTime } from "@/lib/format";

type Mode = "route" | "trip";
const PERIOD_LABELS: Record<(typeof ROUTE_WATCH_PERIOD_HOURS)[number], string> = {
  12: "12 horas",
  24: "24 horas",
  72: "3 días",
  168: "7 días",
};

function placeLabel(places: readonly CorridorPlace[], km: number): string {
  const near = nearestPlace(places, km);
  return near && Math.abs(near.deltaKm) < 3 ? near.place.name : `km ${km.toFixed(0)} del mapa`;
}

/** Number inputs and datetime-local values arrive as strings; empty means "use the default". */
function readTripFields(form: FormData) {
  const departLocal = String(form.get("departAt") ?? "");
  const speed = Number(form.get("avgSpeedKmh"));
  return {
    ...(departLocal ? { departAt: new Date(departLocal).toISOString() } : {}),
    ...(Number.isFinite(speed) && speed > 0 ? { avgSpeedKmh: speed } : {}),
  };
}

export function RouteWatchPanel() {
  const [places, setPlaces] = useState<CorridorPlace[] | null>(null);
  const [watches, setWatches] = useState<RouteWatch[] | null>(null);
  const [mode, setMode] = useState<Mode>("route");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadWatches = useCallback(async () => {
    try {
      const body = RouteWatchListSchema.parse(
        await getJson("/api/company/trips", { provider: "dashboard-api", operation: "route_watch.list", retries: 0 }),
      );
      setWatches(body.watches);
    } catch {
      setMessage("No se pudieron cargar las vigilancias activas. El acceso puede haber vencido.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCorridor().then(
      (corridor) => {
        if (!cancelled) setPlaces([...corridor.places].sort((a, b) => a.km - b.km));
      },
      () => {
        if (!cancelled) setMessage("No se pudo cargar la lista de lugares de la PE-22.");
      },
    );
    const initial = window.setTimeout(() => void loadWatches(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
    };
  }, [loadWatches]);

  const placeOptions = useMemo(
    () =>
      (places ?? []).map((place) => (
        <option key={`${place.name}-${place.km}`} value={place.km}>
          {place.name} (km {place.km.toFixed(0)})
        </option>
      )),
    [places],
  );

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const originKm = Number(form.get("originKm"));
    const destinationKm = Number(form.get("destinationKm"));
    if (originKm === destinationKm) {
      setMessage("El origen y el destino deben ser distintos.");
      return;
    }
    setBusy(true);
    setMessage("");
    const base = { phone: String(form.get("phone") ?? ""), originKm, destinationKm, callConsent: form.get("callConsent") === "on" };
    const body =
      mode === "route" ? { ...base, mode, watchHours: Number(form.get("watchHours")) } : { ...base, mode, ...readTripFields(form) };
    try {
      const created = await postDashboard("/api/company/trips", body, RouteWatchCreatedSchema);
      const until = created.watchUntil ?? created.estimatedArrival;
      setMessage(
        created.mode === "route"
          ? `Vigilancia activa hasta ${formatDateTime(until ?? null)}. Te llamaremos si hay un incidente urgente en la ruta o a menos de 5 km.`
          : `Viaje registrado; llegada estimada ${formatDateTime(until ?? null)}. Te llamaremos por incidentes urgentes por delante del camión.`,
      );
      element.reset();
      await loadWatches();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo registrar la vigilancia.");
    } finally {
      setBusy(false);
    }
  }

  async function stop(id: string) {
    setBusy(true);
    try {
      await cancelRouteWatch(id);
      setMessage("Vigilancia detenida; no habrá más llamadas por esa ruta.");
      await loadWatches();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo detener la vigilancia.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="route-watch-title">
      <h2 id="route-watch-title">Vigilancia de rutas con llamada</h2>
      <p>
        Elige el tramo de la Carretera Central (PE-22) que te interesa. Si aparece un huaico, derrumbe, inundación o cierre en ese tramo o a
        menos de 5 km, te llamamos y enviamos el detalle por WhatsApp. Solo llamamos por incidentes oficiales o reportes comunitarios
        corroborados; una estimación de lluvia nunca dispara una llamada, y la falta de llamadas no confirma que la vía esté libre.
      </p>
      <form className="platform-form" onSubmit={(event) => void register(event)}>
        <fieldset className="platform-modes">
          <legend>Tipo de vigilancia</legend>
          <label className="platform-consent">
            <input type="radio" name="mode" checked={mode === "route"} onChange={() => setMode("route")} />
            Vigilar la ruta de forma continua (flota en operación)
          </label>
          <label className="platform-consent">
            <input type="radio" name="mode" checked={mode === "trip"} onChange={() => setMode("trip")} />
            Un viaje de camión (posición estimada por hora de salida y velocidad)
          </label>
        </fieldset>
        <label>
          Origen
          <select name="originKm" required disabled={!places} defaultValue="">
            <option value="" disabled>
              {places ? "Elige un lugar" : "Cargando lugares…"}
            </option>
            {placeOptions}
          </select>
        </label>
        <label>
          Destino
          <select name="destinationKm" required disabled={!places} defaultValue="">
            <option value="" disabled>
              {places ? "Elige un lugar" : "Cargando lugares…"}
            </option>
            {placeOptions}
          </select>
        </label>
        {mode === "route" ? (
          <label>
            Vigilar durante
            <select name="watchHours" defaultValue={24}>
              {ROUTE_WATCH_PERIOD_HOURS.map((hours) => (
                <option key={hours} value={hours}>
                  {PERIOD_LABELS[hours]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Salida (vacío = ahora)
              <input name="departAt" type="datetime-local" />
            </label>
            <label>
              Velocidad promedio del camión (km/h)
              <input name="avgSpeedKmh" type="number" min={5} max={90} step={1} placeholder="35" />
            </label>
          </>
        )}
        <label>
          Celular del monitor
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            minLength={9}
            maxLength={20}
            required
            autoComplete="tel"
            placeholder="9XX XXX XXX"
          />
        </label>
        <label className="platform-consent">
          <input name="callConsent" type="checkbox" required />
          Autorizo llamadas automáticas y mensajes de WhatsApp a este número sobre incidentes urgentes en esta ruta.
        </label>
        <button className="pr-btn" disabled={busy || !places}>
          {busy ? "Guardando…" : mode === "route" ? "Activar vigilancia" : "Registrar viaje"}
        </button>
      </form>

      <h3>Vigilancias activas</h3>
      {watches === null ? (
        <p>Cargando vigilancias…</p>
      ) : watches.length === 0 ? (
        <p>No hay vigilancias activas para esta empresa.</p>
      ) : (
        <ul className="platform-watches">
          {watches.map((watch) => (
            <li key={watch.id}>
              <div>
                <strong>{places ? `${placeLabel(places, watch.originKm)} → ${placeLabel(places, watch.destinationKm)}` : "PE-22"}</strong>
                <span>
                  {watch.watchUntil
                    ? `Continua hasta ${formatDateTime(watch.watchUntil)}`
                    : `Viaje · salida ${formatDateTime(watch.departAt)} · ${watch.avgSpeedKmh} km/h`}
                  {" · "}
                  {watch.callCount === 0 ? "sin llamadas" : `${watch.callCount} llamada(s), última ${formatDateTime(watch.lastCallAt)}`}
                </span>
              </div>
              <button type="button" className="pr-btn" disabled={busy} onClick={() => void stop(watch.id)}>
                Detener
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
