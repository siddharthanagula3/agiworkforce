import { generateHTML } from '@tiptap/core';
import { parseChartArtifact, type ChartSpec } from '@agiworkforce/types';
import {
  createDocumentMarkdownManager,
  documentEditorExtensions,
} from '../document-editor-markdown';
import { parseDeck, slideSegments } from './deck-model';
import { parseShapes, type DeckShape } from './deck-shapes';
import { DECK_FONT_STACKS, resolveDeckTheme, type DeckTheme } from './deck-themes';

const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const SHAPE_VIEW_WIDTH = 1600;
const SHAPE_VIEW_HEIGHT = 900;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownHtml(markdown: string): string {
  if (!markdown.trim()) return '';
  const manager = createDocumentMarkdownManager();
  return generateHTML(manager.parse(markdown), documentEditorExtensions());
}

function imagesHtml(text: string): { html: string; rest: string } {
  const parts: string[] = [];
  for (const match of text.matchAll(IMAGE_PATTERN)) {
    const src = match[2]!;
    if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=]+$/i.test(src)) {
      parts.push(`<img src="${src}" alt="${escapeHtml(match[1] ?? '')}">`);
    } else {
      parts.push(`<p class="note">An image from another site is not included in this page.</p>`);
    }
  }
  return { html: parts.join(''), rest: text.replace(IMAGE_PATTERN, '') };
}

function chartSvg(spec: ChartSpec, theme: DeckTheme): string {
  const width = 640;
  const height = 300;
  const pad = 36;
  const rows = spec.rows;
  const read = (row: ChartSpec['rows'][number], key: string) => Number(row[key]) || 0;
  const title = spec.title
    ? `<text x="0" y="16" class="chart-title">${escapeHtml(spec.title)}</text>`
    : '';
  if (spec.kind === 'pie') {
    const series = spec.series[0];
    if (!series) return '';
    const values = rows.map((row) => Math.max(0, read(row, series.dataKey)));
    const sum = values.reduce((total, value) => total + value, 0) || 1;
    const radius = 110;
    const cx = 140;
    const cy = 160;
    let angle = -Math.PI / 2;
    const slices = values
      .map((value, index) => {
        const sweep = (value / sum) * Math.PI * 2;
        const x1 = cx + radius * Math.cos(angle);
        const y1 = cy + radius * Math.sin(angle);
        angle += sweep;
        const x2 = cx + radius * Math.cos(angle);
        const y2 = cy + radius * Math.sin(angle);
        const large = sweep > Math.PI ? 1 : 0;
        const label = escapeHtml(String(rows[index]?.[spec.xKey] ?? ''));
        return `<path d="M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${large} 1 ${x2},${y2} Z" fill="${theme.accent}" fill-opacity="${1 - (index % 5) * 0.16}"><title>${label}: ${value}</title></path><text x="290" y="${70 + index * 24}">${label}: ${value}</text>`;
      })
      .join('');
    return `<svg viewBox="0 0 ${width} ${height + 20}" role="img" aria-label="${escapeHtml(spec.title ?? 'Pie chart')}">${title}${slices}</svg>`;
  }
  const values = rows.flatMap((row) => spec.series.map((series) => read(row, series.dataKey)));
  const max = Math.max(...values, 0) || 1;
  const min = Math.min(...values, 0);
  const plotHeight = height - pad * 1.5;
  const y = (value: number) => 24 + plotHeight * ((max - value) / (max - min));
  const slot = (width - pad) / Math.max(rows.length, 1);
  const labels = rows
    .map(
      (row, index) =>
        `<text x="${pad + slot * index + slot / 2}" y="${height}" text-anchor="middle">${escapeHtml(String(row[spec.xKey] ?? ''))}</text>`,
    )
    .join('');
  const marks = spec.series
    .map((series, seriesIndex) => {
      const opacity = 1 - seriesIndex * 0.25;
      if (spec.kind === 'line') {
        const points = rows
          .map((row, index) => `${pad + slot * index + slot / 2},${y(read(row, series.dataKey))}`)
          .join(' ');
        return `<polyline points="${points}" fill="none" stroke="${theme.accent}" stroke-opacity="${opacity}" stroke-width="3"/>`;
      }
      const barWidth = (slot * 0.7) / spec.series.length;
      return rows
        .map((row, index) => {
          const value = read(row, series.dataKey);
          const top = Math.min(y(value), y(0));
          return `<rect x="${pad + slot * index + slot * 0.15 + barWidth * seriesIndex}" y="${top}" width="${barWidth}" height="${Math.abs(y(0) - y(value))}" fill="${theme.accent}" fill-opacity="${opacity}"><title>${escapeHtml(String(row[spec.xKey] ?? ''))}: ${value}</title></rect>`;
        })
        .join('');
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height + 10}" role="img" aria-label="${escapeHtml(spec.title ?? 'Chart')}">${title}<line x1="${pad}" x2="${width}" y1="${y(0)}" y2="${y(0)}" stroke="${theme.muted}"/>${marks}${labels}</svg>`;
}

function shapesSvg(shapes: readonly DeckShape[], theme: DeckTheme): string {
  if (shapes.length === 0) return '';
  const px = (value: number, axis: 'x' | 'y') =>
    (value / 100) * (axis === 'x' ? SHAPE_VIEW_WIDTH : SHAPE_VIEW_HEIGHT);
  const body = shapes
    .map((shape) => {
      const x = px(shape.x, 'x');
      const y = px(shape.y, 'y');
      const w = px(shape.w, 'x');
      const h = px(shape.h, 'y');
      const paint = `fill="${theme.surface}" stroke="${theme.accent}" stroke-width="6"`;
      const label = shape.text
        ? `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" fill="${theme.text}" font-size="38">${escapeHtml(shape.text)}</text>`
        : '';
      switch (shape.kind) {
        case 'line':
        case 'arrow':
          return `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="${theme.accent}" stroke-width="6" stroke-linecap="round"${shape.kind === 'arrow' ? ' marker-end="url(#arrow)"' : ''}/>`;
        case 'oval':
          return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${paint}/>${label}`;
        case 'diamond':
          return `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" ${paint}/>${label}`;
        default:
          return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${shape.kind === 'rounded' ? Math.min(w, h) * 0.18 : 0}" ${paint}/>${label}`;
      }
    })
    .join('');
  return `<svg class="shapes" viewBox="0 0 ${SHAPE_VIEW_WIDTH} ${SHAPE_VIEW_HEIGHT}" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${theme.accent}"/></marker></defs>${body}</svg>`;
}

async function mermaidSvg(source: string, id: string): Promise<string> {
  try {
    const mermaid = (await import('mermaid')).default;
    const { svg } = await mermaid.render(id, source);
    return svg;
  } catch {
    return `<pre>${escapeHtml(source)}</pre>`;
  }
}

async function slideHtml(slide: string, index: number, theme: DeckTheme): Promise<string> {
  const parts: string[] = [];
  let shapes: DeckShape[] = [];
  for (const [position, segment] of slideSegments(slide).entries()) {
    if (segment.kind === 'markdown') {
      const { html, rest } = imagesHtml(segment.text);
      parts.push(markdownHtml(rest), html);
    } else if (segment.kind === 'chart') {
      const parsed = parseChartArtifact(segment.source);
      parts.push(
        parsed.ok
          ? `<figure class="visual">${chartSvg(parsed.spec, theme)}</figure>`
          : `<p class="note">${escapeHtml(parsed.reason)}</p>`,
      );
    } else if (segment.kind === 'mermaid') {
      parts.push(
        `<figure class="visual">${await mermaidSvg(segment.source, `deck-html-${index}-${position}`)}</figure>`,
      );
    } else {
      shapes = parseShapes(segment.source);
    }
  }
  return `<section class="slide" aria-roledescription="slide" aria-label="Slide ${index + 1}"${index === 0 ? '' : ' hidden'}><div class="body">${parts.join('')}</div>${shapesSvg(shapes, theme)}</section>`;
}

function styles(theme: DeckTheme): string {
  const heading = DECK_FONT_STACKS[theme.headingFont].replace(/var\([^)]*\),\s*/g, '');
  const bodyFont = DECK_FONT_STACKS[theme.bodyFont].replace(/var\([^)]*\),\s*/g, '');
  return `*{box-sizing:border-box}html,body{margin:0;height:100%;background:#111;color:${theme.text}}
body{display:flex;flex-direction:column;font-family:${bodyFont}}
main{flex:1;display:flex;align-items:center;justify-content:center;padding:16px;min-height:0}
.stage{width:min(100%,calc((100vh - 96px)*16/9));container-type:inline-size}
.slide{position:relative;aspect-ratio:16/9;width:100%;overflow:hidden;background:${theme.background};color:${theme.text};border-radius:8px}
.slide[hidden]{display:none}
.body{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:1.6cqw;padding:5.5cqw 7cqw;font-size:2.1cqw;line-height:1.45;overflow:hidden}
h1,h2,h3,h4{margin:0;font-family:${heading};font-weight:650;line-height:1.15}
h1{font-size:4.6cqw}h2{font-size:3.6cqw}h3{font-size:2.8cqw}h4{font-size:2.4cqw}
h1::after,h2:first-child::after{display:block;width:6cqw;height:.35cqw;margin-top:1.2cqw;background:${theme.accent};content:''}
p{margin:0}ul,ol{margin:0;padding-inline-start:1.2em}li::marker{color:${theme.accent}}
a{color:${theme.accent}}blockquote{margin:0;padding-inline-start:1.4cqw;border-inline-start:.4cqw solid ${theme.accent};color:${theme.muted}}
code{padding:.1em .3em;border-radius:.3em;background:${theme.surface};font-size:.9em}
pre{margin:0;padding:1.2cqw 1.6cqw;border-radius:.8cqw;background:${theme.surface};font-size:1.6cqw;overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:1.7cqw}th,td{padding:.7cqw 1cqw;border-bottom:.12cqw solid color-mix(in srgb,${theme.text} 22%,transparent);text-align:start}
img{display:block;max-width:100%;max-height:34cqw;margin:0 auto;border-radius:.8cqw;object-fit:contain}
.visual{margin:0;min-height:0}.visual svg{display:block;width:100%;max-height:30cqw;fill:${theme.text};font-size:14px}
.chart-title{font-weight:600}.note{color:${theme.muted};font-size:1.4cqw}
.shapes{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
nav{display:flex;align-items:center;justify-content:center;gap:12px;padding:12px;color:#f5f5f5;font:14px system-ui,sans-serif}
nav button{min-width:44px;min-height:44px;border:1px solid #555;border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer}
nav button:disabled{opacity:.35;cursor:default}nav button:focus-visible{outline:2px solid #fff;outline-offset:2px}`;
}

const SCRIPT = `(()=>{const s=[...document.querySelectorAll('.slide')];let i=0;const c=document.getElementById('count');const p=document.getElementById('prev');const n=document.getElementById('next');
function show(k){i=Math.max(0,Math.min(s.length-1,k));s.forEach((e,j)=>{e.hidden=j!==i});c.textContent=(i+1)+' / '+s.length;p.disabled=i===0;n.disabled=i===s.length-1}
p.onclick=()=>show(i-1);n.onclick=()=>show(i+1);document.getElementById('full').onclick=()=>{const r=document.documentElement;document.fullscreenElement?document.exitFullscreen():r.requestFullscreen&&r.requestFullscreen()};
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();show(i+1)}else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();show(i-1)}else if(e.key==='Home'){show(0)}else if(e.key==='End'){show(s.length-1)}});show(0)})();`;

export async function buildDeckHtml(title: string, content: string): Promise<string> {
  const deck = parseDeck(content);
  const theme = resolveDeckTheme(deck.meta);
  const slides: string[] = [];
  for (const [index, slide] of deck.slides.entries())
    slides.push(await slideHtml(slide, index, theme));
  const safeTitle = escapeHtml(title);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title><style>${styles(theme)}</style></head><body><main><div class="stage" role="region" aria-roledescription="slide deck" aria-label="${safeTitle}">${slides.join('')}</div></main><nav aria-label="Slides"><button id="prev" type="button" aria-label="Previous slide">&#8249;</button><span id="count" aria-live="polite"></span><button id="next" type="button" aria-label="Next slide">&#8250;</button><button id="full" type="button" aria-label="Full screen">&#x26F6;</button></nav><script>${SCRIPT}</script></body></html>`;
}
