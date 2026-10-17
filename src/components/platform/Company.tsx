"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { WeeklyReportDataSchema } from "@/contracts/platform";
import { getJson } from "@/integrations/http/fetch-json";
import { postDashboard } from "@/integrations/dashboard-api/write";

const SessionSchema = z.object({ organizationId: z.uuid(), expiresAt: z.iso.datetime() });
const ReportsSchema = z.object({
  reports: z.array(z.object({ id: z.uuid(), periodStart: z.iso.date(), periodEnd: z.iso.date(), data: WeeklyReportDataSchema })),
});
export function Company() {
  const [session, setSession] = useState<z.infer<typeof SessionSchema> | null>(null);
  const [reports, setReports] = useState<z.infer<typeof ReportsSchema> | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getJson("/api/company", { provider: "dashboard-api", operation: "company.session", retries: 0 }).then(
      (body) => {
        const parsed = SessionSchema.safeParse(body);
        if (parsed.success && !cancelled) setSession(parsed.data);
      },
      () => {
        if (!cancelled) setMessage("Ingresa un código de empresa activo.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void getJson("/api/company/reports", { provider: "dashboard-api", operation: "company.reports", retries: 0 }).then(
      (body) => {
        const parsed = ReportsSchema.safeParse(body);
        if (!cancelled) {
          if (parsed.success) setReports(parsed.data);
          else setMessage("Formato de informe no disponible.");
        }
      },
      () => {
        if (!cancelled) setMessage("No se pudieron cargar los informes. El acceso puede haber vencido.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const code = new FormData(event.currentTarget).get("code");
    try {
      setSession(await postDashboard("/api/access", { code }, SessionSchema));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo ingresar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="platform-page">
      <nav>
        <Link href="/">← Mapa</Link>
        <Link href="/impacto">Impacto y lista de espera</Link>
      </nav>
      <h1>Empresas</h1>
      {!session ? (
        <form className="platform-form" onSubmit={(event) => void login(event)}>
          <label>
            Código de acceso
            <input name="code" type="password" minLength={16} maxLength={100} required autoComplete="off" />
          </label>
          <button className="pr-btn" disabled={busy}>
            {busy ? "Verificando…" : "Ingresar"}
          </button>
        </form>
      ) : (
        <>
          <p>Acceso activo hasta {new Date(session.expiresAt).toLocaleString("es-PE", { timeZone: "America/Lima" })}.</p>
          <section>
            <h2>Planificación de salida</h2>
            <p>
              El pronóstico de riesgo y la evaluación de salida todavía no están disponibles. No se interpreta la falta de datos como vía
              segura.
            </p>
          </section>
          <section>
            <h2>Informes semanales</h2>
            {reports ? (
              reports.reports.length ? (
                reports.reports.map((report) => (
                  <article key={report.id}>
                    <h3>
                      {report.periodStart} — {report.periodEnd}
                    </h3>
                    <p>{report.data.summary}</p>
                    <dl>
                      {Object.entries(report.data.metrics).map(([name, value]) => (
                        <div key={name}>
                          <dt>{name}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <ul>
                      {report.data.limitations.map((limitation) => (
                        <li key={limitation}>{limitation}</li>
                      ))}
                    </ul>
                  </article>
                ))
              ) : (
                <p>No hay informes generados para esta empresa.</p>
              )
            ) : (
              <p>Cargando informes…</p>
            )}
          </section>
        </>
      )}
      <p role="status">{message}</p>
    </main>
  );
}
