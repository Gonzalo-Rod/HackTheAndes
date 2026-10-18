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
  // Provenance stays available without exposing internal identifiers on driver-facing pages.
  pdf.setSubject(
    JSON.stringify({
      assessmentId: report.outlook.assessmentId,
      geometryRevision: report.range.geometryRevision,
      policyVersion: report.outlook.policyVersion,
      sources: report.sources,
    }),
  );
  pdf.setCreationDate(new Date(report.generatedAt));
  pdf.setModificationDate(new Date(report.generatedAt));
  const regular = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([WIDTH, HEIGHT]),
    y = HEIGHT - MARGIN;
  const clean = (s: string) =>
    s
      .replace(/[–—−]/g, "-")
      .replace(/→/g, " a ")
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
  paragraph(`Periodo del informe: ${formatReportDate(report.period.start)} - ${formatReportDate(report.period.end)} (Perú).`, 9, muted);
  paragraph(`Generado: ${formatReportDate(report.generatedAt)} (Perú).`, 9, muted);
  page.drawRectangle({ x: MARGIN - 8, y: y - 40, width: WIDTH - 2 * MARGIN + 16, height: 42, color: pale });
  y -= 13;
  paragraph("ATENCIÓN POR LLUVIA Y TERRENO. Riesgo estimado; no confirma un huaico ni una vía segura.", 9, teal, true);
  y -= 10;
  heading("Resumen");
  for (const id of report.summaryIds) {
    const fact = report.facts.find((f) => f.id === id);
    if (fact) paragraph(`- ${fact.text}`);
  }
  heading("Qué incluyen los avisos");
  paragraph(
    `Primer registro completo de SUTRAN disponible: ${report.observations.firstRecordedAt ? formatReportDate(report.observations.firstRecordedAt) : "sin evidencia disponible"}. No implica que hayamos vigilado la vía desde entonces sin interrupciones.`,
    9,
  );
  paragraph(
    "Contamos los avisos que recibimos durante el periodo. No conocemos todos los eventos ocurridos; un aviso de la comunidad puede referirse al mismo evento que una alerta de SUTRAN.",
    9,
  );
  heading("Dónde prestar más atención");
  paragraph(
    `Pronóstico consultado: ${formatReportDate(report.outlook.capturedAt)}. Al preparar el informe estaba: ${report.outlook.state === "ready" ? "vigente" : report.outlook.state === "stale" ? "desactualizado" : "no disponible"}.`,
    9,
  );
  paragraph(
    `Ventana del pronóstico: ${formatReportDate(report.outlook.validFrom)} - ${formatReportDate(report.outlook.validUntil)} (Perú).`,
    9,
  );
  const labels = {
    routine: "Sin señal elevada en esta evaluación",
    watch: "Atención",
    priority: "Atención prioritaria",
    high_attention: "Atención alta",
    unknown: "Sin datos suficientes o actualizados",
  };
  for (const key of Object.keys(labels) as (keyof typeof labels)[])
    paragraph(`${labels[key]}: ${report.outlook.kilometers[key].toFixed(2)} km`, 9);
  heading("Lluvia estimada por tramo", 255);
  paragraph(
    "Es la lluvia estimada en zonas que pueden aportar agua a estos tramos. No es la altura del agua en la carretera ni confirma que habrá un huaico.",
    9,
  );
  paragraph(
    "Los mm indican cantidad de lluvia. 'Sin datos' indica información incompleta o vencida, no ausencia de lluvia. Las comas separan tramos distintos.",
    9,
    muted,
  );
  paragraph(
    `Pronóstico de 3 días: ${formatReportDate(report.outlook.validFrom)} - ${formatReportDate(report.outlook.validUntil)} (Perú).`,
    9,
    muted,
  );
  const stretches = report.outlook.rainfallStretches;
  if (!stretches) paragraph("Este informe anterior no incluye lluvia por km. Envía PDF al bot para pedir uno nuevo.", 9);
  else if (!stretches.length) paragraph("No tenemos zonas vinculadas a este tramo para estimar su lluvia.", 9);
  else {
    function rainfallHeader() {
      page.drawRectangle({ x: MARGIN - 5, y: y - 7, width: WIDTH - 2 * MARGIN + 10, height: 23, color: pale });
      for (const [text, x] of [
        ["Tramo aprox.", MARGIN],
        ["Periodo del informe (mm)", 280],
        ["3 días siguientes (mm)", 417],
      ] as const)
        page.drawText(text, { x, y, size: 9, font: bold, color: teal });
      y -= 25;
    }
    // Equal rainfall can share a table row; separated kilometer ranges stay explicit.
    const rows = new Map<string, { ranges: string[]; rainMmPeriod: number | null; rainMmNext72h: number | null }>();
    for (const stretch of stretches) {
      const key = JSON.stringify([stretch.rainMmPeriod, stretch.rainMmNext72h]);
      const row = rows.get(key) ?? { ranges: [], rainMmPeriod: stretch.rainMmPeriod, rainMmNext72h: stretch.rainMmNext72h };
      row.ranges.push(`${stretch.startKm.toFixed(1)} a ${stretch.endKm.toFixed(1)}`);
      rows.set(key, row);
    }
    rainfallHeader();
    for (const row of rows.values()) {
      const lines = ["Km"];
      for (const range of row.ranges) {
        const last = lines.length - 1;
        const next = `${lines[last]}${lines[last] === "Km" ? " " : ", "}${range}`;
        if (regular.widthOfTextAtSize(next, 9) > 205) {
          lines[last] += ",";
          lines.push(range);
        } else lines[last] = next;
      }
      // Bounded chunks keep long lists on the page, repeating their rainfall values.
      const maxLinesPerRow = 12;
      for (let offset = 0; offset < lines.length; offset += maxLinesPerRow) {
        const chunk = lines.slice(offset, offset + maxLinesPerRow);
        const rowHeight = Math.max(20, chunk.length * 14 + 6);
        if (y - rowHeight < 65) {
          newPage();
          paragraph("Lluvia estimada por tramo (continuación)", 11, teal, true);
          rainfallHeader();
        }
        for (const [index, line] of chunk.entries())
          page.drawText(line, { x: MARGIN, y: y - index * 14, size: 9, font: regular, color: ink });
        for (const [text, x] of [
          [row.rainMmPeriod === null ? "Sin datos" : row.rainMmPeriod.toFixed(1), 280],
          [row.rainMmNext72h === null ? "Sin datos" : row.rainMmNext72h.toFixed(1), 417],
        ] as const)
          page.drawText(text, { x, y, size: 9, font: regular, color: ink });
        y -= rowHeight;
      }
      page.drawLine({ start: { x: MARGIN, y: y + 5 }, end: { x: WIDTH - MARGIN, y: y + 5 }, color: pale, thickness: 0.5 });
    }
    y -= 5;
    paragraph(
      "Solo se muestran tramos con zonas vinculadas. Si hay varias, se usa la mayor lluvia estimada; no se suman sus valores. Los km no son hitos oficiales.",
      8,
      muted,
    );
  }
  heading("Ten en cuenta", 225);
  for (const text of report.limitations) paragraph(`- ${text}`, 9, muted);
  heading("De dónde viene la información", 100);
  paragraph(
    "Clima: Open-Meteo (modelo IFS). Terreno: INGEMMET. Avisos viales: SUTRAN y comunidad. Zonas de drenaje: HydroBASINS, con asociación aproximada a la vía.",
    9,
    muted,
  );
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
