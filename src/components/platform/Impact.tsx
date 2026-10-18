"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicStats } from "@/contracts/platform";
import { fetchStats } from "@/integrations/dashboard-api/client";
import { WaitlistForm } from "./WaitlistForm";

const LABELS: Record<keyof Omit<PublicStats, "asOf" | "exclusions">, string> = {
  queriesAnswered: "Consultas respondidas",
  returningUsers: "Personas con uso repetido",
  reports: "Reportes recibidos",
  uniqueReporters: "Personas que reportaron",
  returningReporters: "Personas que volvieron a reportar",
  subscribers: "Suscriptores activos",
  companiesOnWaitlist: "Empresas en lista de espera",
  dispatchDecisions: "Decisiones de salida",
  callsPlaced: "Llamadas registradas",
  callsAnswered: "Llamadas contestadas",
};
export function Impact() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void fetchStats().then(
        (data) => {
          if (!cancelled) {
            setStats(data);
            setError(false);
          }
        },
        () => {
          if (!cancelled) setError(true);
        },
      );
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  return (
    <main className="platform-page">
      <nav>
        <Link href="/">← Mapa</Link>
        <Link href="/empresa">Acceso de empresas</Link>
      </nav>
      <h1>Impacto registrado</h1>
      <p>Uso registrado en el producto. Excluye al equipo, pruebas y trabajos automáticos. Estas cifras no prueban eficacia predictiva.</p>
      {error && <p role="alert">Métricas no disponibles.{stats ? " Se muestran los últimos datos recibidos." : " Intenta más tarde."}</p>}
      {!stats && !error && <p role="status">Consultando métricas…</p>}
      {stats && (
        <>
          <div className="platform-metrics">
            {Object.entries(LABELS).map(([key, label]) => (
              <article key={key}>
                <strong>{stats[key as keyof typeof LABELS]}</strong>
                <span>{label}</span>
              </article>
            ))}
          </div>
          <p>
            Consulta: {new Date(stats.asOf).toLocaleString("es-PE", { timeZone: "America/Lima" })}. Las consultas de WhatsApp y entrevistas
            todavía no están instrumentadas.
          </p>
        </>
      )}
      <section>
        <h2>Participa con tu empresa</h2>
        <p>
          Para transportistas y equipos de despacho que usan la Carretera Central. El registro permite que conversemos sobre sus
          necesidades.
        </p>
        <WaitlistForm />
      </section>
    </main>
  );
}
