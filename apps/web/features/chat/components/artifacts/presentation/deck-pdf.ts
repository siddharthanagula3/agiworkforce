import type jsPDF from 'jspdf';
import { markdownToDocumentBlocks } from '@agiworkforce/unified-chat/markdown-document';
import { parseChartArtifact, type ChartSpec } from '@agiworkforce/types';
import {
  renderPdfSlides,
  type PdfArea,
  type PdfRgb,
  type PdfSlide,
} from '@features/chat/services/export-pdf';
import { parseDeck, slideSegments } from './deck-model';
import { parseShapes, type DeckShape } from './deck-shapes';
import { resolveDeckTheme, type DeckTheme } from './deck-themes';

const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const VISUAL_GAP = 10;
const LABEL_SIZE = 8;
const MERMAID_SCALE = 2;
const NO_LABELS_DIRECTIVE = '%%{init: {"flowchart": {"htmlLabels": false}} }%%\n';

type Visual =
  | { kind: 'image'; data: string; format: string; width: number; height: number }
  | { kind: 'missing'; label: string }
  | { kind: 'chart'; spec: ChartSpec }
  | { kind: 'raster'; data: string; width: number; height: number };

function rgb(hex: string): PdfRgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function imageFormat(dataUrl: string): string | null {
  const match = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.exec(dataUrl);
  if (!match) return null;
  const type = match[1]!.toLowerCase();
  return type === 'jpg' ? 'JPEG' : type.toUpperCase();
}

function imageSize(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

async function rasterizeSvg(
  svg: string,
): Promise<{ data: string; width: number; height: number } | null> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => resolve(null);
      candidate.src = url;
    });
    if (!image || image.naturalWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth * MERMAID_SCALE;
    canvas.height = image.naturalHeight * MERMAID_SCALE;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      data: canvas.toDataURL('image/png'),
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const DIAGRAM_MISSING: Visual = { kind: 'missing', label: 'Diagram could not be drawn in the PDF' };

async function renderMermaid(source: string, id: string): Promise<Visual> {
  try {
    const mermaid = (await import('mermaid')).default;
    const { svg } = await mermaid.render(id, `${NO_LABELS_DIRECTIVE}${source}`);
    const raster = await rasterizeSvg(svg);
    return raster ? { kind: 'raster', ...raster } : DIAGRAM_MISSING;
  } catch {
    return DIAGRAM_MISSING;
  }
}

function hostOf(src: string): string {
  try {
    return new URL(src).host;
  } catch {
    return 'another site';
  }
}

async function collectVisuals(
  slide: string,
  slideIndex: number,
): Promise<{ text: string; visuals: Visual[]; shapes: DeckShape[] }> {
  const visuals: Visual[] = [];
  let shapes: DeckShape[] = [];
  const texts: string[] = [];
  for (const [position, segment] of slideSegments(slide).entries()) {
    if (segment.kind === 'markdown') {
      const images = [...segment.text.matchAll(IMAGE_PATTERN)];
      for (const match of images) {
        const src = match[2]!;
        const format = imageFormat(src);
        const size = format ? await imageSize(src) : null;
        if (format && size) visuals.push({ kind: 'image', data: src, format, ...size });
        else visuals.push({ kind: 'missing', label: `Image from ${hostOf(src)} is not included` });
      }
      texts.push(segment.text.replace(IMAGE_PATTERN, '').trim());
    } else if (segment.kind === 'chart') {
      const parsed = parseChartArtifact(segment.source);
      visuals.push(
        parsed.ok
          ? { kind: 'chart', spec: parsed.spec }
          : { kind: 'missing', label: parsed.reason },
      );
    } else if (segment.kind === 'mermaid') {
      visuals.push(await renderMermaid(segment.source, `deck-pdf-${slideIndex}-${position}`));
    } else {
      shapes = parseShapes(segment.source);
    }
  }
  return { text: texts.filter(Boolean).join('\n\n'), visuals, shapes };
}

function fit(width: number, height: number, box: PdfArea): PdfArea {
  const scale = Math.min(box.width / width, box.height / height, 1.5);
  const w = width * scale;
  const h = height * scale;
  return { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h };
}

function drawLabel(pdf: jsPDF, label: string, box: PdfArea, theme: DeckTheme): void {
  const [r, g, b] = rgb(theme.muted);
  pdf.setDrawColor(r, g, b);
  pdf.setLineDashPattern([3, 2], 0);
  pdf.rect(box.x, box.y, box.width, box.height, 'S');
  pdf.setLineDashPattern([], 0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(LABEL_SIZE);
  pdf.setTextColor(r, g, b);
  pdf.text(label, box.x + box.width / 2, box.y + box.height / 2, {
    align: 'center',
    baseline: 'middle',
    maxWidth: box.width - 8,
  });
}

function seriesColor(theme: DeckTheme, index: number): PdfRgb {
  const [ar, ag, ab] = rgb(theme.accent);
  const [tr, tg, tb] = rgb(theme.text);
  const mixRatio = Math.min(0.6, index * 0.25);
  return [
    Math.round(ar * (1 - mixRatio) + tr * mixRatio),
    Math.round(ag * (1 - mixRatio) + tg * mixRatio),
    Math.round(ab * (1 - mixRatio) + tb * mixRatio),
  ];
}

function drawChart(pdf: jsPDF, spec: ChartSpec, box: PdfArea, theme: DeckTheme): void {
  const [tr, tg, tb] = rgb(theme.text);
  const [mr, mg, mb] = rgb(theme.muted);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(LABEL_SIZE);
  let top = box.y;
  if (spec.title) {
    pdf.setTextColor(tr, tg, tb);
    pdf.text(spec.title, box.x, top + LABEL_SIZE);
    top += LABEL_SIZE + 6;
  }
  const values = spec.rows.flatMap((row) =>
    spec.series.map((series) => {
      const value = row[series.dataKey];
      return typeof value === 'number' ? value : Number(value) || 0;
    }),
  );
  if (spec.kind === 'pie') {
    const series = spec.series[0];
    if (!series) return;
    const slices = spec.rows.map((row) => Math.max(0, Number(row[series.dataKey]) || 0));
    const sum = slices.reduce((total, value) => total + value, 0) || 1;
    const radius = Math.min(box.width / 2, box.height - (top - box.y)) / 2;
    const cx = box.x + radius + 4;
    const cy = top + radius;
    let angle = -Math.PI / 2;
    slices.forEach((value, index) => {
      const sweep = (value / sum) * Math.PI * 2;
      const steps = Math.max(2, Math.ceil(sweep / 0.15));
      const points: [number, number][] = [];
      for (let step = 0; step <= steps; step += 1) {
        const a = angle + (sweep * step) / steps;
        points.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
      }
      const [r, g, b] = seriesColor(theme, index);
      pdf.setFillColor(r, g, b);
      const deltas = [
        [points[0]![0] - cx, points[0]![1] - cy],
        ...points.slice(1).map((point, i) => [point[0] - points[i]![0], point[1] - points[i]![1]]),
      ];
      pdf.lines(deltas, cx, cy, [1, 1], 'F', true);
      const label = String(spec.rows[index]?.[spec.xKey] ?? '');
      pdf.setTextColor(tr, tg, tb);
      pdf.text(`${label}: ${value}`, cx + radius + 16, top + 10 + index * (LABEL_SIZE + 4));
      angle += sweep;
    });
    return;
  }
  const max = Math.max(...values, 0) || 1;
  const min = Math.min(...values, 0);
  const plot: PdfArea = {
    x: box.x + 24,
    y: top,
    width: box.width - 28,
    height: box.y + box.height - top - LABEL_SIZE - 6,
  };
  const zeroY = plot.y + plot.height * (max / (max - min));
  pdf.setDrawColor(mr, mg, mb);
  pdf.setLineWidth(0.5);
  pdf.line(plot.x, zeroY, plot.x + plot.width, zeroY);
  pdf.setTextColor(mr, mg, mb);
  pdf.text(String(max), plot.x - 4, plot.y + LABEL_SIZE / 2, { align: 'right' });
  const slot = plot.width / Math.max(spec.rows.length, 1);
  const y = (value: number) => plot.y + plot.height * ((max - value) / (max - min));
  spec.rows.forEach((row, rowIndex) => {
    pdf.setTextColor(mr, mg, mb);
    pdf.text(
      String(row[spec.xKey] ?? ''),
      plot.x + slot * rowIndex + slot / 2,
      plot.y + plot.height + LABEL_SIZE + 2,
      { align: 'center', maxWidth: slot - 2 },
    );
  });
  spec.series.forEach((series, seriesIndex) => {
    const [r, g, b] = seriesColor(theme, seriesIndex);
    const read = (row: (typeof spec.rows)[number]) => Number(row[series.dataKey]) || 0;
    if (spec.kind === 'line') {
      pdf.setDrawColor(r, g, b);
      pdf.setLineWidth(1.5);
      spec.rows.forEach((row, rowIndex) => {
        const next = spec.rows[rowIndex + 1];
        if (!next) return;
        pdf.line(
          plot.x + slot * rowIndex + slot / 2,
          y(read(row)),
          plot.x + slot * (rowIndex + 1) + slot / 2,
          y(read(next)),
        );
      });
      return;
    }
    const barWidth = (slot * 0.7) / spec.series.length;
    pdf.setFillColor(r, g, b);
    spec.rows.forEach((row, rowIndex) => {
      const value = read(row);
      const x = plot.x + slot * rowIndex + slot * 0.15 + barWidth * seriesIndex;
      const top = Math.min(y(value), zeroY);
      pdf.rect(x, top, barWidth, Math.abs(zeroY - y(value)), 'F');
    });
  });
}

function drawShapes(
  pdf: jsPDF,
  shapes: readonly DeckShape[],
  page: PdfArea,
  theme: DeckTheme,
): void {
  const [sr, sg, sb] = rgb(theme.surface);
  const [ar, ag, ab] = rgb(theme.accent);
  const [tr, tg, tb] = rgb(theme.text);
  pdf.setLineWidth(1.5);
  for (const shape of shapes) {
    const x = (shape.x / 100) * page.width;
    const y = (shape.y / 100) * page.height;
    const w = (shape.w / 100) * page.width;
    const h = (shape.h / 100) * page.height;
    pdf.setFillColor(sr, sg, sb);
    pdf.setDrawColor(ar, ag, ab);
    if (shape.kind === 'line' || shape.kind === 'arrow') {
      pdf.line(x, y, x + w, y + h);
      if (shape.kind === 'arrow') {
        const angle = Math.atan2(h, w);
        const size = 6;
        pdf.setFillColor(ar, ag, ab);
        pdf.triangle(
          x + w,
          y + h,
          x + w - size * Math.cos(angle - 0.45),
          y + h - size * Math.sin(angle - 0.45),
          x + w - size * Math.cos(angle + 0.45),
          y + h - size * Math.sin(angle + 0.45),
          'F',
        );
      }
      continue;
    }
    if (shape.kind === 'oval') pdf.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 'FD');
    else if (shape.kind === 'diamond') {
      pdf.lines(
        [
          [w / 2, h / 2],
          [-w / 2, h / 2],
          [-w / 2, -h / 2],
          [w / 2, -h / 2],
        ],
        x + w / 2,
        y,
        [1, 1],
        'FD',
        true,
      );
    } else if (shape.kind === 'rounded')
      pdf.roundedRect(x, y, w, h, Math.min(w, h) * 0.18, Math.min(w, h) * 0.18, 'FD');
    else pdf.rect(x, y, w, h, 'FD');
    if (shape.text) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(LABEL_SIZE + 1);
      pdf.setTextColor(tr, tg, tb);
      pdf.text(shape.text, x + w / 2, y + h / 2, {
        align: 'center',
        baseline: 'middle',
        maxWidth: w - 4,
      });
    }
  }
}

function drawVisuals(
  pdf: jsPDF,
  visuals: readonly Visual[],
  area: PdfArea,
  theme: DeckTheme,
): void {
  if (visuals.length === 0 || area.height < 24) return;
  const width = (area.width - VISUAL_GAP * (visuals.length - 1)) / visuals.length;
  visuals.forEach((visual, index) => {
    const box: PdfArea = {
      x: area.x + index * (width + VISUAL_GAP),
      y: area.y,
      width,
      height: area.height,
    };
    if (visual.kind === 'image' || visual.kind === 'raster') {
      const target = fit(visual.width, visual.height, box);
      pdf.addImage(
        visual.data,
        visual.kind === 'raster' ? 'PNG' : visual.format,
        target.x,
        target.y,
        target.width,
        target.height,
      );
    } else if (visual.kind === 'chart') {
      drawChart(pdf, visual.spec, box, theme);
    } else {
      drawLabel(pdf, visual.label, { ...box, height: Math.min(box.height, 48) }, theme);
    }
  });
}

export async function buildDeckPdf(title: string, content: string): Promise<jsPDF> {
  const deck = parseDeck(content);
  const theme = resolveDeckTheme(deck.meta);
  const slides: PdfSlide[] = [];
  for (const [index, slide] of deck.slides.entries()) {
    const { text, visuals, shapes } = await collectVisuals(slide, index);
    slides.push({
      blocks: markdownToDocumentBlocks(text),
      drawVisuals: (pdf, area, page) => {
        drawVisuals(pdf, visuals, area, theme);
        drawShapes(pdf, shapes, page, theme);
      },
    });
  }
  return renderPdfSlides(slides, {
    title,
    palette: { background: rgb(theme.background), text: rgb(theme.text), muted: rgb(theme.muted) },
  });
}

export async function downloadDeckPdf(title: string, content: string): Promise<void> {
  const pdf = await buildDeckPdf(title, content);
  pdf.save(`${title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'presentation'}.pdf`);
}
