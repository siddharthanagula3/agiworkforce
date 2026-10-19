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
});
