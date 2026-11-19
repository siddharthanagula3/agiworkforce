import {
  DECK_PDF_PAGE_HEIGHT,
  DECK_PDF_PAGE_WIDTH,
  deckPrintHtml,
} from '../presentation/deckPrint';

const DECK =
  '<!-- deck theme=midnight -->\n# Launch plan\nWhy now\n\n---\n\n## Steps\n- Ship it\n\n---\n\n## Thanks';

function sections(html: string): string[] {
  return [...html.matchAll(/<section class="slide" data-slide="(\d+)">([\s\S]*?)<\/section>/g)].map(
    (match) => `${match[1]}:${match[2]}`,
  );
}

describe('deckPrintHtml', () => {
  it('puts each slide on its own landscape page, in order', () => {
    const html = deckPrintHtml(DECK)!;
    const pages = sections(html);
    expect(pages).toHaveLength(3);
    expect(pages[0]).toMatch(/^1:.*<h1[^>]*>Launch plan<\/h1>[\s\S]*Why now/);
    expect(pages[1]).toMatch(/^2:.*<h2[^>]*>Steps<\/h2>[\s\S]*<li>Ship it<\/li>/);
    expect(pages[2]).toMatch(/^3:.*<h2[^>]*>Thanks<\/h2>/);
    expect(html).toContain(
      `@page { size: ${DECK_PDF_PAGE_WIDTH}px ${DECK_PDF_PAGE_HEIGHT}px; margin: 0; }`,
    );
    expect(html).toContain('page-break-after: always');
    expect(DECK_PDF_PAGE_WIDTH / DECK_PDF_PAGE_HEIGHT).toBeCloseTo(16 / 9, 2);
  });

  it('leaves the deck line off the first page', () => {
    const html = deckPrintHtml(DECK)!;
    expect(html).not.toContain('<!--');
    expect(html).not.toContain('deck theme');
  });

  it('splits a deck without rules on its headings', () => {
    expect(sections(deckPrintHtml('# One\nA\n## Two\nB')!)).toHaveLength(2);
  });

  it('never writes script from a slide into the page', () => {
    const html = deckPrintHtml(
      '# One\n\n<script>alert(1)</script>\n\nText <img src=x onerror=alert(1)>',
    )!;
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img[^>]*onerror/i);
  });

  it('has nothing to print for an empty deck', () => {
    expect(deckPrintHtml('')).toBeNull();
    expect(deckPrintHtml('<!-- deck -->\n')).toBeNull();
  });
});
