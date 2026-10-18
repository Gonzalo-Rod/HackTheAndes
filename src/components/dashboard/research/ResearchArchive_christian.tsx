"use client";

import { STATUS_META } from "@/components/alert-meta";
import { Icon } from "@/components/icons";
import type { WeeklyState } from "@/contracts/weekly-incident-report_christian";
import { formatCalendarDate, formatDateTime } from "@/lib/format";

export function ResearchArchive({ reports }: { reports: WeeklyState[] }) {
  if (reports.length === 0) return <p className="pr-research__muted">El archivo semanal todavía no está disponible.</p>;
  return (
    <div className="pr-research-archive">
      {reports.map((report) => {
        const lastRun = report.runs[report.runs.length - 1];
        return (
          <section key={report.window.startDate}>
            <h3>
              {formatCalendarDate(report.window.startDate)} — {formatCalendarDate(report.window.endDate)}
            </h3>
            <p>Recopilado: {formatDateTime(report.updatedAt)}. Capturas históricas; no sustituyen el estado vial actual.</p>
            {lastRun && (
              <p className="pr-research-archive__health">
                {Object.entries(lastRun.sources).map(([source, run]) => (
                  <span key={source} data-ok={run.ok}>
                    {source === "googleNews" ? "Noticias" : source.toUpperCase()}: {run.ok ? "consultado" : "no disponible"}
                    {run.note ? " · con observaciones" : ""}
                  </span>
                ))}
              </p>
            )}
            <h4>{report.sutran.length} observaciones oficiales de SUTRAN</h4>
            <ul>
              {report.sutran.map(({ alert, lastSeenAt }) => (
                <li key={alert.id}>
                  <strong>
                    {alert.roadCode} · {alert.kmText}
                  </strong>
                  <span>
                    {STATUS_META[alert.roadStatus].label} al {formatDateTime(lastSeenAt)}
                  </span>
                  <span>
                    {alert.district} · Evento: {formatCalendarDate(alert.eventDate)}
                  </span>
                </li>
              ))}
            </ul>
            <h4>{report.indeci.length} reportes de INDECI</h4>
            {report.indeci.length === 0 ? (
              <p>No se verificaron reportes que cumplieran los criterios de esta recopilación.</p>
            ) : (
              <ul>
                {report.indeci.map((entry) => (
                  <li key={entry.url}>
                    <a href={entry.url} target="_blank" rel="noopener noreferrer">
                      {entry.title} <Icon name="external" size={11} />
                    </a>
                    <span>
                      Ocurrencia: {entry.occurredDate ? formatCalendarDate(entry.occurredDate) : "sin fecha confirmada"}. Ubicación
                      administrativa, sin un pin inferido.
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <h4>{report.news.length} noticias por verificar</h4>
            <p>
              Son pistas de búsqueda. La fecha de Google News no confirma la fecha del incidente; no se cuentan como alertas ni generan
              pines.
            </p>
            <ul>
              {report.news.map((entry) => (
                <li key={entry.key}>
                  <a href={entry.url} target="_blank" rel="noopener noreferrer">
                    {entry.title} <Icon name="external" size={11} />
                  </a>
                  <span>
                    {entry.outlet ?? "Google News"} · listado el {formatDateTime(entry.listedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
