import { describe, it, expect, vi } from 'vitest';
import { buildDeckHtml } from './deck-html';
import { buildDeckPdf } from './deck-pdf';

vi.mock('mermaid', () => ({
  default: {
    render: vi.fn(async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' })),
  },
}));

const DECK = [
  '<!-- deck theme=midnight -->',
  '',
  '# Q3 <review>',
  '',
  'Highlights',
  '',
  '---',
  '',
  '## Revenue',
  '',
  '```chart',
  '{"type":"bar","xKey":"q","data":[{"q":"Q1","v":3},{"q":"Q2","v":5}],"series":[{"dataKey":"v"}]}',
  '```',
  '',
  '![tracker](https://evil.example/pixel.png)',
  '',
  '---',
  '',
  '## Flow',
  '',
  '```shapes',
  '{"shapes":[{"kind":"rect","x":10,"y":10,"w":20,"h":20,"text":"Start"},{"kind":"arrow","x":30,"y":20,"w":20,"h":0}]}',
  '```',
].join('\n');

describe('deck export', () => {
  it('publishes a self-contained viewer with one section per slide', async () => {
    const html = await buildDeckHtml('Board <deck>', DECK);
    expect(html.match(/<section class="slide"/g)).toHaveLength(3);
    expect(html).toContain('<title>Board &lt;deck&gt;</title>');
    expect(html).toContain('Q3 &lt;review&gt;');
    expect(html).toContain('<rect');
    expect(html).toContain('Start');
    expect(html).not.toContain('evil.example');
    expect(html).toContain('An image from another site is not included');
    expect(html).toContain('id="next"');
    expect(html).toContain('#0b1533');
  });

  it('makes a landscape PDF with one page per slide', async () => {
    const pdf = await buildDeckPdf('Board deck', DECK);
    expect(pdf.getNumberOfPages()).toBe(3);
    const size = pdf.internal.pageSize;
    expect(size.getWidth()).toBeGreaterThan(size.getHeight());
  });

  it('labels every pie slice with a legend swatch in the viewer and the PDF', async () => {
    const pie = [
      '## Status',
      '',
      '```chart',
      '{"type":"pie","xKey":"s","data":[{"s":"Approved","v":5},{"s":"Pending","v":3},{"s":"Declined","v":1}],"series":[{"dataKey":"v"}]}',
      '```',
    ].join('\n');
    const html = await buildDeckHtml('Pie', pie);
    expect(html.match(/class="legend-row"/g)).toHaveLength(3);
    for (const label of ['Approved: 5', 'Pending: 3', 'Declined: 1']) expect(html).toContain(label);
    const opacities = [...html.matchAll(/<path [^>]*fill-opacity="([\d.]+)"/g)].map((m) => m[1]);
    expect(new Set(opacities).size).toBe(3);

    const pdf = await buildDeckPdf('Pie', pie);
    expect(pdf.getNumberOfPages()).toBe(1);
  });

  it('draws KPI tiles and a Key insights callout in the viewer and the PDF', async () => {
    const analysis = [
      '## Review',
      '',
      '```kpi',
      'Approval rate | 57.3% | of 1,200 reviewed',
      'Reviewed | 1,200',
      'Median wait | 4 h',
      'Backlog | <90',
      'Extra | dropped',
      '```',
      '',
      '```insights',
      '- 57.3% approval rate indicates strong curation',
      '- Backlog stays under <90 items',
      '```',
    ].join('\n');
    const html = await buildDeckHtml('Analysis', analysis);
    expect(html.match(/class="kpi-tile"/g)).toHaveLength(4);
    expect(html).toContain('<span class="kpi-value">57.3%</span>');
    expect(html).toContain('Backlog stays under &lt;90 items');
    expect(html).toContain('Key insights');
    expect(html).not.toContain('Extra');

    const pdf = await buildDeckPdf('Analysis', analysis);
    expect(pdf.getNumberOfPages()).toBe(1);
  });
});
