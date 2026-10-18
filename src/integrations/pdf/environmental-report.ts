import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { environmentalReportSchema, type EnvironmentalReport } from "@peruroad/road-data/reports";
const WIDTH = 595.28,
  HEIGHT = 841.89,
  MARGIN = 42;
const ink = rgb(0.09, 0.16, 0.22),
  muted = rgb(0.31, 0.38, 0.42),
  teal = rgb(0.02, 0.38, 0.37),
  pale = rgb(0.91, 0.96, 0.95);
export function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
/** Pure Node PDF generation avoids a browser/Python dependency in Vercel functions. */
export async function renderEnvironmentalPdf(raw: EnvironmentalReport): Promise<Uint8Array> {
  const report = environmentalReportSchema.parse(raw);
  const pdf = await PDFDocument.create();
  pdf.setTitle("PeruRoad Climate - Informe ambiental semanal");
  pdf.setAuthor("PeruRoad Climate");
  pdf.setCreationDate(new Date(report.generatedAt));
  pdf.setModificationDate(new Date(report.generatedAt));
  const regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([WIDTH, HEIGHT]),
    y = HEIGHT - MARGIN;
  const clean = (s: string) =>
    s
      .replace(/[–—−]/g, "-")
      .replace(/\u00a0/g, " ")
      .replace(/[^\u0020-\u007e\u00a1-\u00ff]/g, "");
  function newPage() {
    page = pdf.addPage([WIDTH, HEIGHT]);
    y = HEIGHT - MARGIN;
    page.drawText("PERUROAD CLIMATE - Informe ambiental", { x: MARGIN, y, size: 9, font: bold, color: teal });
    y -= 24;
  }
  function paragraph(text: string, size = 10, color = ink, isBold = false) {
    const font = isBold ? bold : regular,
      words = clean(text).split(/\s+/);
    let line = "";
    const draw = () => {
      if (y < 65) newPage();
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= size * 1.45;
    };
    for (const original of words) {
      // Long source URLs wrap even when they contain no whitespace.
      const parts = font.widthOfTextAtSize(original, size) > WIDTH - 2 * MARGIN ? (original.match(/.{1,60}/g) ?? []) : [original];
      for (const [partIndex, word] of parts.entries()) {
        if (partIndex > 0 && line) {
          draw();
          line = "";
        }
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > WIDTH - 2 * MARGIN && line) {
          draw();
          line = word;
        } else line = next;
      }
    }
    if (line) draw();
    y -= 5;
  }
  function heading(text: string, minimumSpace = 110) {
    if (y < minimumSpace) newPage();
    y -= 10;
    paragraph(text, 12, teal, true);
  }
  page.drawRectangle({ x: 0, y: HEIGHT - 115, width: WIDTH, height: 115, color: teal });
  page.drawText("PERUROAD CLIMATE", { x: MARGIN, y: HEIGHT - 43, size: 12, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`${report.isDemo ? "DEMO - " : ""}Informe ambiental semanal`, {
    x: MARGIN,
    y: HEIGHT - 73,
    size: 21,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Lluvia, territorio y preparación - PE-22", {
    x: MARGIN,
    y: HEIGHT - 96,
    size: 10,
    font: regular,
    color: rgb(0.85, 0.97, 0.96),
  });
  y = HEIGHT - 140;
  paragraph(report.range.label, 13, ink, true);
  paragraph(
    `Km aproximados del eje mapeado: ${report.range.startKm.toFixed(1)} a ${report.range.endKm.toFixed(1)}. No son hitos oficiales.`,
    9,
    muted,
  );
  paragraph(`Periodo del archivo: ${formatReportDate(report.period.start)} - ${formatReportDate(report.period.end)} (Perú).`, 9, muted);
  paragraph(`Generado: ${formatReportDate(report.generatedAt)} (Perú).`, 9, muted);
  page.drawRectangle({ x: MARGIN - 8, y: y - 40, width: WIDTH - 2 * MARGIN + 16, height: 42, color: pale });
  y -= 13;
  paragraph("EXPOSICIÓN ESTIMADA. No es una predicción de huaico ni una garantía de vía segura.", 9, teal, true);
  y -= 10;
  heading("Resumen");
  for (const id of report.summaryIds) {
    const fact = report.facts.find((f) => f.id === id);
    if (fact) paragraph(`- ${fact.text}`);
  }
  heading("Cobertura del archivo");
  paragraph(
    `Primer sondeo SUTRAN completo registrado: ${report.observations.firstRecordedAt ? formatReportDate(report.observations.firstRecordedAt) : "sin evidencia disponible"}. La fecha no demuestra monitoreo continuo.`,
    9,
  );
  paragraph(
    "Los conteos corresponden a registros incorporados por PeruRoad durante el periodo, no a un inventario completo de desastres. Comunidad y SUTRAN pueden describir el mismo evento.",
    9,
  );
  heading("Pronóstico capturado y cobertura espacial");
  paragraph(
    `Captura de lluvia: ${formatReportDate(report.outlook.capturedAt)}. Estado al generar: ${report.outlook.state === "ready" ? "vigente" : report.outlook.state === "stale" ? "desactualizado" : "no disponible"}.`,
    9,
  );
  paragraph(
    `Ventana del pronóstico: ${formatReportDate(report.outlook.validFrom)} - ${formatReportDate(report.outlook.validUntil)} (Perú).`,
    9,
  );
  const labels = {
    routine: "Sin señal elevada bajo estas reglas",
    watch: "Atención",
    priority: "Atención prioritaria",
    high_attention: "Atención alta",
    unknown: "Sin evaluación suficiente/vigente",
  };
  for (const key of Object.keys(labels) as (keyof typeof labels)[])
    paragraph(`${labels[key]}: ${report.outlook.kilometers[key].toFixed(2)} km`, 9);
  heading("Lluvia por cuenca asociada (modelada)", 80 + report.outlook.catchments.length * 19);
  paragraph(
    "Periodo del archivo / siguientes 72 h desde la captura. Un guion indica datos incompletos o no vigentes; los valores no se suman entre cuencas.",
    9,
    muted,
  );
  if (!report.outlook.catchments.length) paragraph("Sin cuencas asociadas verificadas para este tramo.");
  for (const c of report.outlook.catchments)
    paragraph(
      `${c.id}: ${c.rainMmPeriod === null ? "-" : c.rainMmPeriod.toFixed(1) + " mm"} / ${c.rainMmNext72h === null ? "-" : c.rainMmNext72h.toFixed(1) + " mm"}`,
      9,
    );
  heading("Límites e interpretación", 225);
  for (const text of report.limitations) paragraph(`- ${text}`, 9, muted);
  heading("Fuentes y trazabilidad");
  for (const source of [
    ...new Set(
      report.sources.map((value) => {
        const url = new URL(value);
        return `${url.origin}${url.pathname}`;
      }),
    ),
  ])
    paragraph(source, 8, muted);
  paragraph(`Evaluación: ${report.outlook.assessmentId}; reglas: ${report.outlook.policyVersion}`, 8, muted);
  paragraph(`Geometría: ${report.range.geometryRevision}`, 8, muted);
  paragraph(
    "SEMANAL BAJA cancela solo los informes. BAJA cancela informes y alertas. Este documento no contiene datos del remitente.",
    9,
    teal,
  );
  for (const [index, p] of pdf.getPages().entries()) {
    p.drawLine({ start: { x: MARGIN, y: 45 }, end: { x: WIDTH - MARGIN, y: 45 }, color: pale, thickness: 1 });
    p.drawText(`PeruRoad Climate | ${report.isDemo ? "DEMO | " : ""}${index + 1} / ${pdf.getPageCount()} | Hora de Perú`, {
      x: MARGIN,
      y: 30,
      size: 8,
      font: regular,
      color: muted,
    });
  }
  return pdf.save();
}
