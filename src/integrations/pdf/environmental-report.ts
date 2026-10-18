import { PDFDocument, StandardFonts } from "pdf-lib";
import { environmentalReportSchema, type EnvironmentalReport } from "@peruroad/road-data/reports";
import { exposureShares, RAIN_BLOCK_KM, rainBlocks, rainChart, wettestBlocks } from "@/domain/reports/report-visuals";
import { drawExposureBar, drawKpiCards, drawRainChart, EXPOSURE_COLORS, PALETTE, pdfText, type Canvas } from "./report-charts";
const WIDTH = 595.28,
  HEIGHT = 841.89,
  MARGIN = 42,
  CONTENT_WIDTH = WIDTH - 2 * MARGIN;
const { ink, muted, primary: teal, surface: pale } = PALETTE;
const OUTLOOK_STATE = {
  ready: { label: "Pronóstico vigente", color: PALETTE.primary, background: PALETTE.primarySoft },
  stale: { label: "Pronóstico desactualizado", color: PALETTE.warning, background: PALETTE.warningSoft },
  unavailable: { label: "Pronóstico no disponible", color: PALETTE.warning, background: PALETTE.warningSoft },
} as const;
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
function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long" }).format(new Date(value));
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
  const canvas = (): Canvas => ({ page, regular, bold });
  function newPage() {
    page = pdf.addPage([WIDTH, HEIGHT]);
    y = HEIGHT - MARGIN;
    page.drawText("PERUROAD CLIMATE - Informe ambiental", { x: MARGIN, y, size: 9, font: bold, color: teal });
    y -= 24;
  }
  function paragraph(text: string, size = 10, color = ink, isBold = false, indent = 0) {
    const font = isBold ? bold : regular,
      words = pdfText(text).split(/\s+/),
      width = CONTENT_WIDTH - indent;
    let line = "";
    const draw = () => {
      if (y < 65) newPage();
      page.drawText(line, { x: MARGIN + indent, y, size, font, color });
      y -= size * 1.45;
    };
    for (const original of words) {
      // Long source URLs wrap even when they contain no whitespace.
      const parts = font.widthOfTextAtSize(original, size) > width ? (original.match(/.{1,60}/g) ?? []) : [original];
      for (const [partIndex, word] of parts.entries()) {
        if (partIndex > 0 && line) {
          draw();
          line = "";
        }
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > width && line) {
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
  function bullet(text: string, size = 10) {
    if (y < 80) newPage();
    page.drawCircle({ x: MARGIN + 4, y: y + size * 0.32, size: 2.4, color: teal });
    paragraph(text, size, ink, false, 14);
  }
  function sectionTitle(title: string, subtitle: string) {
    page.drawText(pdfText(title), { x: MARGIN, y, size: 13, font: bold, color: teal });
    y -= 15;
    page.drawText(pdfText(subtitle), { x: MARGIN, y, size: 8.5, font: regular, color: muted });
    y -= 16;
  }
  /** Page 1 answers "how is my route this week?" with figures; text detail follows on later pages. */
  function drawCover() {
    page.drawRectangle({ x: 0, y: HEIGHT - 128, width: WIDTH, height: 128, color: teal });
    page.drawText("PERUROAD CLIMATE", { x: MARGIN, y: HEIGHT - 40, size: 10, font: bold, color: PALETTE.primarySoft });
    page.drawText(pdfText(`${report.isDemo ? "DEMO - " : ""}Informe ambiental semanal`), {
      x: MARGIN,
      y: HEIGHT - 68,
      size: 22,
      font: bold,
      color: PALETTE.white,
    });
    page.drawText(pdfText(report.range.label.slice(0, 80)), { x: MARGIN, y: HEIGHT - 91, size: 11, font: bold, color: PALETTE.white });
    page.drawText(
      pdfText(
        `Km ${report.range.startKm.toFixed(1)} a ${report.range.endKm.toFixed(1)} (aprox., no hitos oficiales)  |  ${formatShortDate(report.period.start)} - ${formatShortDate(report.period.end)}  |  Generado ${formatReportDate(report.generatedAt)}`,
      ),
      { x: MARGIN, y: HEIGHT - 110, size: 8.5, font: regular, color: PALETTE.primarySoft },
    );
    y = HEIGHT - 150;
    const state = OUTLOOK_STATE[report.outlook.state];
    const pill = pdfText(`${state.label}  |  consultado ${formatReportDate(report.outlook.capturedAt)}`);
    page.drawRectangle({ x: MARGIN, y: y - 6, width: bold.widthOfTextAtSize(pill, 8.5) + 16, height: 19, color: state.background });
    page.drawText(pill, { x: MARGIN + 8, y, size: 8.5, font: bold, color: state.color });
    y -= 30;

    const { kilometers, rainfallStretches } = report.outlook;
    const elevatedKm = kilometers.priority + kilometers.high_attention;
    y -= drawKpiCards(
      canvas(),
      [
        {
          value: String(report.observations.officialEnvironmentalAlerts),
          label: "Alertas SUTRAN",
          note: "ambientales en el periodo",
          accent: teal,
        },
        {
          value: String(report.observations.communityEnvironmentalIncidents),
          label: "Avisos comunidad",
          note: "sin confirmar",
          accent: PALETTE.warning,
        },
        { value: elevatedKm.toFixed(1), label: "Km con atención", note: "prioritaria o alta, 3 días", accent: EXPOSURE_COLORS.priority },
        { value: kilometers.unknown.toFixed(1), label: "Km sin datos", note: "no significa sin peligro", accent: PALETTE.muted },
      ],
      MARGIN,
      y,
      CONTENT_WIDTH,
    );
    y -= 26;

    sectionTitle(
      "Dónde prestar atención en los próximos 3 días",
      `Lluvia prevista sobre terreno susceptible. ${formatReportDate(report.outlook.validFrom)} - ${formatReportDate(report.outlook.validUntil)} (Perú).`,
    );
    y -= drawExposureBar(canvas(), exposureShares(kilometers), MARGIN, y, CONTENT_WIDTH);
    y -= 22;

    sectionTitle(
      "Lluvia a lo largo de tu tramo",
      "Lluvia estimada en las zonas que drenan hacia cada tramo. No es agua sobre la vía ni confirma un huaico.",
    );
    const chart = rainChart(report);
    if (!chart) {
      paragraph(
        rainfallStretches
          ? "No tenemos zonas vinculadas a este tramo para estimar su lluvia."
          : "Este informe anterior no incluye lluvia por km. Envía PDF al bot para pedir uno nuevo.",
        9,
        muted,
      );
    } else {
      y -= drawRainChart(canvas(), chart, MARGIN, y, CONTENT_WIDTH, 175);
      y -= 8;
      const wettest = wettestBlocks(report);
      paragraph(
        wettest.length
          ? `Más lluvia prevista: ${wettest.map((item) => `km ${item.startKm.toFixed(0)}-${item.endKm.toFixed(0)} (${item.rainMmNext72h.toFixed(1)} mm)`).join(", ")}.`
          : "Sin lluvia prevista en los tramos con datos para los próximos 3 días.",
        9,
        ink,
        true,
      );
    }

    page.drawRectangle({ x: MARGIN - 8, y: 58, width: CONTENT_WIDTH + 16, height: 34, color: pale });
    page.drawText(pdfText("Estimación por lluvia y terreno. No confirma un huaico ni certifica una vía segura."), {
      x: MARGIN,
      y: 78,
      size: 9,
      font: bold,
      color: teal,
    });
    page.drawText(pdfText("Consulta las alertas oficiales de SUTRAN antes de viajar. Detalle y fuentes en las páginas siguientes."), {
      x: MARGIN,
      y: 65,
      size: 8,
      font: regular,
      color: muted,
    });
    newPage();
  }
  drawCover();
  heading("Resumen", 0);
  for (const id of report.summaryIds) {
    const fact = report.facts.find((f) => f.id === id);
    if (fact) bullet(fact.text);
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
  heading("Detalle: lluvia estimada cada 10 km", 255);
  paragraph(
    `Mayor lluvia estimada en las zonas que drenan hacia cada bloque de hasta ${RAIN_BLOCK_KM} km. 'Sin datos' indica información incompleta o vencida, no ausencia de lluvia.`,
    9,
    muted,
  );
  const stretches = report.outlook.rainfallStretches;
  const chart = rainChart(report);
  if (!stretches) paragraph("Este informe anterior no incluye lluvia por km. Envía PDF al bot para pedir uno nuevo.", 9);
  else if (!chart) paragraph("No tenemos zonas vinculadas a este tramo para estimar su lluvia.", 9);
  else {
    const columns = { range: MARGIN, period: 175, next: 345 },
      barWidthMax = 110,
      rowHeight = 18;
    function rainfallHeader() {
      page.drawRectangle({ x: MARGIN - 5, y: y - 7, width: CONTENT_WIDTH + 10, height: 22, color: pale });
      for (const [label, x] of [
        ["Tramo aprox.", columns.range],
        ["Periodo del informe (mm)", columns.period],
        ["Próximos 3 días (mm)", columns.next],
      ] as const)
        page.drawText(pdfText(label), { x, y, size: 9, font: bold, color: teal });
      y -= 24;
    }
    function rainCell(mm: number | null, x: number, color: typeof ink) {
      if (mm === null) {
        page.drawText("Sin datos", { x, y, size: 9, font: regular, color: muted });
        return;
      }
      const width = chart ? Math.max(1, (mm / chart.maxMm) * barWidthMax) : 0;
      page.drawRectangle({ x, y: y - 2, width, height: 9, color });
      page.drawText(mm.toFixed(1), { x: x + width + 5, y, size: 9, font: regular, color: ink });
    }
    rainfallHeader();
    for (const block of rainBlocks(stretches)) {
      if (y - rowHeight < 65) {
        newPage();
        paragraph("Detalle de lluvia (continuación)", 11, teal, true);
        rainfallHeader();
      }
      page.drawText(pdfText(`Km ${block.startKm.toFixed(0)} - ${block.endKm.toFixed(0)}${block.partial ? " *" : ""}`), {
        x: columns.range,
        y,
        size: 9,
        font: regular,
        color: ink,
      });
      rainCell(block.rainMmPeriod, columns.period, PALETTE.rainPast);
      rainCell(block.rainMmNext72h, columns.next, PALETTE.rainNext);
      page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: WIDTH - MARGIN, y: y - 6 }, color: PALETTE.line, thickness: 0.4 });
      y -= rowHeight;
    }
    y -= 5;
    paragraph(
      "* Parte del bloque no tiene datos; su valor puede quedarse corto. Solo se muestran tramos con zonas vinculadas; si hay varias, se usa la mayor lluvia estimada, sin sumar. Los km no son hitos oficiales.",
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
