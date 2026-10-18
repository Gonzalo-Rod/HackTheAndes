import { rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { kilometerTicks, type ExposureKey, type ExposureShare, type RainChart } from "@/domain/reports/report-visuals";

// pdf-lib drawing primitives for the weekly environmental PDF. Coordinates are PDF points with the
// origin at the bottom-left; every function takes the top edge `y` and returns the height it used.

export function hexColor(hex: string): RGB {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

/** Dashboard tokens (slate-blue primary) so the PDF reads as the same product. */
export const PALETTE = {
  ink: hexColor("#1f2a37"),
  muted: hexColor("#5b6675"),
  primary: hexColor("#2b6789"),
  primarySoft: hexColor("#dce9f2"),
  surface: hexColor("#f1f4f8"),
  line: hexColor("#d5dce5"),
  white: rgb(1, 1, 1),
  rainNext: hexColor("#2f7bd1"),
  rainPast: hexColor("#1f2a37"),
  missing: hexColor("#c9ced6"),
  warning: hexColor("#9a6a00"),
  warningSoft: hexColor("#fbf1d9"),
};

/** Forecast categories reuse the map's violet attention scale; missing data stays neutral gray. */
export const EXPOSURE_COLORS: Record<ExposureKey, RGB> = {
  routine: hexColor("#8fb59a"),
  watch: hexColor("#e2b345"),
  priority: hexColor("#9456ad"),
  high_attention: hexColor("#682583"),
  unknown: hexColor("#c9ced6"),
};

/** Standard fonts are WinAnsi-only, so typographic characters are mapped and the rest dropped. */
export function pdfText(text: string): string {
  return text
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2192/g, " a ")
    .replace(/\u00a0/g, " ")
    .replace(/[^\u0020-\u007e\u00a1-\u00ff]/g, "");
}

export interface Canvas {
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
}

function text(canvas: Canvas, value: string, x: number, y: number, size: number, color: RGB, isBold = false) {
  canvas.page.drawText(pdfText(value), { x, y, size, font: isBold ? canvas.bold : canvas.regular, color });
}

function rightText(canvas: Canvas, value: string, right: number, y: number, size: number, color: RGB, isBold = false) {
  const font = isBold ? canvas.bold : canvas.regular;
  text(canvas, value, right - font.widthOfTextAtSize(pdfText(value), size), y, size, color, isBold);
}

export interface KpiCard {
  value: string;
  label: string;
  note: string;
  accent: RGB;
}

const KPI_HEIGHT = 74;
const KPI_GAP = 10;

export function drawKpiCards(canvas: Canvas, cards: readonly KpiCard[], x: number, y: number, width: number): number {
  const cardWidth = (width - KPI_GAP * (cards.length - 1)) / cards.length;
  for (const [index, card] of cards.entries()) {
    const left = x + index * (cardWidth + KPI_GAP);
    canvas.page.drawRectangle({ x: left, y: y - KPI_HEIGHT, width: cardWidth, height: KPI_HEIGHT, color: PALETTE.surface });
    canvas.page.drawRectangle({ x: left, y: y - KPI_HEIGHT, width: 3, height: KPI_HEIGHT, color: card.accent });
    text(canvas, card.value, left + 12, y - 30, 22, card.accent, true);
    text(canvas, card.label, left + 12, y - 48, 8.5, PALETTE.ink, true);
    text(canvas, card.note, left + 12, y - 61, 7.5, PALETTE.muted);
  }
  return KPI_HEIGHT;
}

const BAR_HEIGHT = 22;
const LEGEND_ROW = 15;

/** One stacked bar for the whole route, then a legend row per category with km and share. */
export function drawExposureBar(canvas: Canvas, shares: readonly ExposureShare[], x: number, y: number, width: number): number {
  let left = x;
  for (const share of shares) {
    const segmentWidth = share.fraction * width;
    if (segmentWidth <= 0) continue;
    canvas.page.drawRectangle({ x: left, y: y - BAR_HEIGHT, width: segmentWidth, height: BAR_HEIGHT, color: EXPOSURE_COLORS[share.key] });
    if (segmentWidth > 34)
      text(
        canvas,
        `${Math.round(share.fraction * 100)}%`,
        left + 5,
        y - 15,
        8,
        share.key === "routine" || share.key === "unknown" || share.key === "watch" ? PALETTE.ink : PALETTE.white,
        true,
      );
    left += segmentWidth;
  }
  if (left === x) canvas.page.drawRectangle({ x, y: y - BAR_HEIGHT, width, height: BAR_HEIGHT, color: PALETTE.missing });
  let rowY = y - BAR_HEIGHT - 18;
  for (const share of [...shares].reverse()) {
    canvas.page.drawRectangle({ x, y: rowY - 1, width: 9, height: 9, color: EXPOSURE_COLORS[share.key] });
    text(canvas, share.label, x + 15, rowY, 9, PALETTE.ink);
    rightText(canvas, `${share.km.toFixed(1)} km`, x + width - 50, rowY, 9, PALETTE.ink, true);
    rightText(canvas, `${Math.round(share.fraction * 100)}%`, x + width, rowY, 9, PALETTE.muted);
    rowY -= LEGEND_ROW;
  }
  return BAR_HEIGHT + 18 + shares.length * LEGEND_ROW;
}

const AXIS_LABEL_WIDTH = 34;
const X_AXIS_SPACE = 30;
const LEGEND_SPACE = 22;

/**
 * Forecast rain (next 3 days) as blue columns along the route, the past period as a dark step line,
 * and stretches missing either value as a gray band under the axis, never as zero rain.
 */
export function drawRainChart(canvas: Canvas, chart: RainChart, x: number, y: number, width: number, height: number): number {
  const plotLeft = x + AXIS_LABEL_WIDTH;
  const plotWidth = width - AXIS_LABEL_WIDTH;
  const plotTop = y - LEGEND_SPACE;
  const plotHeight = height - LEGEND_SPACE - X_AXIS_SPACE;
  const plotBottom = plotTop - plotHeight;
  const spanKm = chart.endKm - chart.startKm;
  const xAt = (km: number) => plotLeft + ((km - chart.startKm) / spanKm) * plotWidth;
  const yAt = (mm: number) => plotBottom + (Math.min(mm, chart.maxMm) / chart.maxMm) * plotHeight;

  legendSwatch(canvas, plotLeft, y - 8, PALETTE.rainNext, "Lluvia prevista, próximos 3 días");
  legendSwatch(canvas, plotLeft + 175, y - 8, PALETTE.rainPast, "Lluvia del periodo del informe", true);
  legendSwatch(canvas, plotLeft + 345, y - 8, PALETTE.missing, "Sin datos");

  for (let mm = 0; mm <= chart.maxMm + 1e-9; mm += chart.stepMm) {
    const tickY = yAt(mm);
    canvas.page.drawLine({
      start: { x: plotLeft, y: tickY },
      end: { x: plotLeft + plotWidth, y: tickY },
      color: PALETTE.line,
      thickness: 0.5,
    });
    rightText(canvas, `${Number.isInteger(mm) ? mm : mm.toFixed(1)}`, plotLeft - 5, tickY - 3, 7.5, PALETTE.muted);
  }
  text(canvas, "mm", x, plotTop + 4, 7.5, PALETTE.muted, true);

  let previous: { endKm: number; mm: number } | null = null;
  for (const bar of chart.bars) {
    const left = xAt(bar.startKm);
    const barWidth = Math.max(0.6, xAt(bar.endKm) - left);
    if (bar.rainMmNext72h !== null && bar.rainMmNext72h > 0)
      canvas.page.drawRectangle({
        x: left,
        y: plotBottom,
        width: barWidth,
        height: yAt(bar.rainMmNext72h) - plotBottom,
        color: PALETTE.rainNext,
      });
    if (bar.rainMmNext72h === null || bar.rainMmPeriod === null)
      canvas.page.drawRectangle({ x: left, y: plotBottom - 7, width: barWidth, height: 4, color: PALETTE.missing });
    if (bar.rainMmPeriod === null) {
      previous = null;
      continue;
    }
    const lineY = yAt(bar.rainMmPeriod);
    // Contiguous stretches join into one step line; a gap or missing value breaks it.
    if (previous && Math.abs(previous.endKm - bar.startKm) < 1e-6)
      canvas.page.drawLine({
        start: { x: left, y: yAt(previous.mm) },
        end: { x: left, y: lineY },
        color: PALETTE.rainPast,
        thickness: 1.4,
      });
    canvas.page.drawLine({ start: { x: left, y: lineY }, end: { x: left + barWidth, y: lineY }, color: PALETTE.rainPast, thickness: 1.4 });
    previous = { endKm: bar.endKm, mm: bar.rainMmPeriod };
  }
  canvas.page.drawLine({
    start: { x: plotLeft, y: plotBottom },
    end: { x: plotLeft + plotWidth, y: plotBottom },
    color: PALETTE.muted,
    thickness: 0.8,
  });

  for (const km of kilometerTicks(chart.startKm, chart.endKm)) {
    const tickX = xAt(km);
    canvas.page.drawLine({
      start: { x: tickX, y: plotBottom },
      end: { x: tickX, y: plotBottom - 3 },
      color: PALETTE.muted,
      thickness: 0.8,
    });
    const label = `km ${km}`;
    text(canvas, label, tickX - canvas.regular.widthOfTextAtSize(label, 7.5) / 2, plotBottom - 17, 7.5, PALETTE.muted);
  }
  return height;
}

function legendSwatch(canvas: Canvas, x: number, y: number, color: RGB, label: string, asLine = false) {
  if (asLine) canvas.page.drawLine({ start: { x, y: y + 3 }, end: { x: x + 12, y: y + 3 }, color, thickness: 1.6 });
  else canvas.page.drawRectangle({ x, y: y - 1, width: 12, height: 8, color });
  text(canvas, label, x + 17, y, 8, PALETTE.ink);
}
