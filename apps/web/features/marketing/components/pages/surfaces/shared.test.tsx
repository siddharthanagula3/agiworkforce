import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FactGrid, PageHero, type FactItem } from './shared';

const SYSTEM_DIR = resolve(__dirname, '..', '..', 'system');
const STYLESHEET = [
  readFileSync(resolve(SYSTEM_DIR, 'system.css'), 'utf8'),
  readFileSync(resolve(SYSTEM_DIR, 'page-header.css'), 'utf8'),
].join('\n');
const FULL_SPAN = '1 / -1';

let sheet: HTMLStyleElement;

beforeEach(() => {
  sheet = document.createElement('style');
  sheet.textContent = STYLESHEET;
  document.head.append(sheet);
});

afterEach(() => {
  sheet.remove();
});

function facts(count: number): FactItem[] {
  return Array.from({ length: count }, (_, index) => ({
    meta: `Meta ${index + 1}`,
    title: `Title ${index + 1}`,
    body: `Body ${index + 1}`,
  }));
}

function renderGrid(count: number, layout?: 'grid' | 'rows') {
  const { container } = render(
    <div data-design="agi">
      <FactGrid items={facts(count)} layout={layout} />
    </div>,
  );
  const cards = Array.from(container.querySelectorAll<HTMLElement>('.agi-ds-card'));
  return {
    container,
    cards,
    spans: cards.map((card) => card.style.gridColumn),
  };
}

function declaredProperty(element: Element, property: string): string | null {
  let value: string | null = null;
  for (const rule of Array.from(sheet.sheet?.cssRules ?? [])) {
    if (!(rule instanceof CSSStyleRule)) continue;
    const declared = rule.style.getPropertyValue(property);
    if (!declared) continue;
    let matches = false;
    try {
      matches = element.matches(rule.selectorText);
    } catch {
      matches = false;
    }
    if (matches) value = declared;
  }
  return value;
}

function declaredWidth(element: Element): string | null {
  return declaredProperty(element, 'width');
}

const HERO_CTAS = [
  { href: '/security', label: 'Read the mechanisms' },
  { href: '#verify', label: 'Verify us yourself', variant: 'secondary' as const },
];

function renderHero(props: Partial<Parameters<typeof PageHero>[0]> = {}) {
  const { container } = render(
    <div data-design="agi" className="agi-ds-page">
      <PageHero
        id="agi-trust-title"
        eyebrow="Trust"
        title="Claims with dates."
        em="dates."
        lede="A posture ledger, not a badge wall."
        ctas={HERO_CTAS}
        {...props}
      />
    </div>,
  );
  const header = container.querySelector<HTMLElement>('section.agi-ds-pagehead');
  if (!header) throw new Error('PageHero rendered no .agi-ds-pagehead section');
  return { container, header };
}

describe('PageHero', () => {
  it('keeps the label, accessible title, actions and visual without introductory copy in minimal mode', () => {
    const { header } = renderHero({ minimal: true, visual: <div data-testid="visual" /> });

    expect(header.getAttribute('aria-labelledby')).toBe('agi-trust-title');
    const title = screen.getByRole('heading', { level: 1, name: 'Claims with dates.' });
    expect(title).toHaveClass('sr-only');
    expect(header.querySelector('.agi-ds-pagehead-label')?.textContent).toBe('Trust');
    expect(screen.queryByText('A posture ledger, not a badge wall.')).not.toBeInTheDocument();
    expect(screen.getByTestId('visual')).toBeInTheDocument();
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/security',
      '#verify',
    ]);
  });

  it('is a title block: label, h1 carrying the id, lede and the buttons in order', () => {
    const { header } = renderHero();

    expect(header.getAttribute('aria-labelledby')).toBe('agi-trust-title');
    const title = screen.getByRole('heading', { level: 1, name: 'Claims with dates.' });
    expect(title.id).toBe('agi-trust-title');
    expect(header.querySelector('.agi-ds-pagehead-label')?.textContent).toBe('Trust');
    expect(header.querySelector('.agi-ds-pagehead-lede')?.textContent).toBe(
      'A posture ledger, not a badge wall.',
    );
    expect(
      screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Read the mechanisms', '/security'],
      ['Verify us yourself', '#verify'],
    ]);
    expect(header.querySelector('.agi-ds-pagehead-label')?.compareDocumentPosition(title)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('renders no button row when there are no calls to action', () => {
    const { header } = renderHero({ ctas: [] });

    expect(header.querySelector('.agi-ds-btn-row')).toBeNull();
    expect(screen.queryAllByRole('link')).toEqual([]);
  });

  it('carries nothing from the landing hero: no hero, eyebrow or accent class, no em or i', () => {
    const { container, header } = renderHero();

    expect(container.querySelector('.agi-ds-hero, .agi-ds-eyebrow, .agi-ds-accent')).toBeNull();
    expect(container.querySelector('.agi-ds-h1')).toBeNull();
    expect(header.querySelector('em, i')).toBeNull();
    expect(header.querySelector('[style]')).toBeNull();
  });

  it('keeps the emphasised fragment as a span in the accent text colour, same family and weight', () => {
    const { header } = renderHero();

    const fragment = header.querySelector<HTMLElement>('.agi-ds-pagehead-em');
    expect(fragment?.tagName).toBe('SPAN');
    expect(fragment?.textContent).toBe('dates.');
    expect(fragment?.closest('h1')?.textContent).toBe('Claims with dates.');
    expect(declaredProperty(fragment!, 'color')).toBe('var(--agi-accent-text)');
    expect(declaredProperty(fragment!, 'font-style')).toBeNull();
    expect(declaredProperty(fragment!, 'font-family')).toBeNull();
    expect(declaredProperty(fragment!, 'font-weight')).toBeNull();
  });

  it('renders the whole title plain when the fragment is not part of it', () => {
    const { header } = renderHero({ em: 'elsewhere' });

    expect(header.querySelector('.agi-ds-pagehead-em')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Claims with dates.');
  });

  it('sets the title in the sans family, upright, at the 2xl size, with a sentence-case label', () => {
    const { header } = renderHero();
    const title = screen.getByRole('heading', { level: 1 });
    const label = header.querySelector('.agi-ds-pagehead-label')!;

    expect(declaredProperty(title, 'font-family')).toBe('var(--agi-font)');
    expect(declaredProperty(title, 'font-style')).toBe('normal');
    expect(declaredProperty(title, 'font-size')).toBe('var(--agi-text-2xl)');
    expect(declaredProperty(label, 'font-family')).toBe('var(--agi-font)');
    expect(declaredProperty(label, 'font-size')).toBe('var(--agi-text-md)');
    expect(declaredProperty(label, 'text-transform')).toBe('none');
    expect(declaredProperty(label, 'color')).toBe('var(--agi-ink-2)');
    expect(declaredProperty(header, 'padding-block')).toBe(
      'var(--agi-pagehead-y-top) var(--agi-pagehead-y-bottom)',
    );
  });

  it('pulls the sections of a page that carries the header onto the inner rhythm', () => {
    const { container } = render(
      <div data-design="agi" className="agi-ds-page">
        <main>
          <PageHero id="agi-trust-title" eyebrow="Trust" title="Claims." lede="Dated." ctas={[]} />
          <section className="agi-ds-section" data-size="md" />
          <section className="agi-ds-section" data-size="sm" />
        </main>
      </div>,
    );
    const [body, compact] = Array.from(container.querySelectorAll('.agi-ds-section'));

    expect(declaredProperty(body!, 'padding-block')).toBe('var(--agi-section-y-inner)');
    expect(declaredProperty(compact!, 'padding-block')).toBe('var(--agi-section-y-xs)');
  });

  it('leaves the sections of a page without the header on the landing rhythm', () => {
    const { container } = render(
      <div data-design="agi" className="agi-ds-page">
        <section className="agi-ds-section" data-size="md" />
      </div>,
    );

    expect(declaredProperty(container.querySelector('.agi-ds-section')!, 'padding-block')).toBe(
      'var(--agi-section-y-md)',
    );
  });

  it('places text-only copy straight in the container, on the section grid', () => {
    const { header } = renderHero();
    const container = header.querySelector('.agi-ds-container');

    expect(container?.firstElementChild?.classList.contains('agi-ds-pagehead-copy')).toBe(true);
    expect(header.querySelector('.agi-ds-pagehead-split')).toBeNull();
  });

  it('renders the visual beside the copy in a split', () => {
    const { header } = renderHero({ visual: <div data-testid="visual" /> });

    expect(screen.getByTestId('visual')).toBeInTheDocument();
    const split = header.querySelector('.agi-ds-pagehead-split');
    expect(split?.children).toHaveLength(2);
    expect(split?.firstElementChild?.classList.contains('agi-ds-pagehead-copy')).toBe(true);
    expect(split?.lastElementChild).toBe(screen.getByTestId('visual'));
  });
});

describe('FactGrid', () => {
  it('leaves three items to the three equal columns the stylesheet gives exactly three children', () => {
    const { container, cards, spans } = renderGrid(3);

    expect(cards).toHaveLength(3);
    expect(spans).toEqual(['', '', '']);
    expect(container.querySelector('.agi-ds-grid-2')?.children).toHaveLength(3);
    expect(STYLESHEET).toMatch(
      /\.agi-ds-grid-2:has\(> :nth-child\(3\):last-child\) \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
    );
  });

  it('spans the last card across the row for five and seven items', () => {
    expect(renderGrid(5).spans).toEqual(['', '', '', '', FULL_SPAN]);
    expect(renderGrid(7).spans).toEqual(['', '', '', '', '', '', FULL_SPAN]);
  });

  it('spans a single item across the row', () => {
    expect(renderGrid(1).spans).toEqual([FULL_SPAN]);
  });

  it('keeps an even count in two columns with no span', () => {
    const { container, spans } = renderGrid(4);

    expect(spans).toEqual(['', '', '', '']);
    expect(container.querySelector('.agi-ds-grid-2')?.children).toHaveLength(4);
  });

  it('renders the grid when layout is named explicitly', () => {
    expect(renderGrid(3, 'grid').container.querySelector('.agi-ds-grid-2')).not.toBeNull();
  });

  it('stacks one full-width card per row when layout is rows', () => {
    const { container, cards, spans } = renderGrid(3, 'rows');

    expect(cards).toHaveLength(3);
    expect(container.querySelector('.agi-ds-grid-2')).toBeNull();
    expect(spans).toEqual(['', '', '']);

    const stack = container.querySelector('.agi-ds-stack');
    expect(stack).not.toBeNull();
    expect(Array.from(stack!.children)).toEqual(cards);
    expect(declaredWidth(stack!)).toBe('100%');
    for (const card of cards) {
      expect(declaredWidth(card)).toBe('100%');
    }
  });

  it('never spans a card in rows, whatever the count', () => {
    expect(renderGrid(5, 'rows').spans).toEqual(['', '', '', '', '']);
  });

  it('keeps the meta, title and body of every item in both layouts', () => {
    for (const layout of ['grid', 'rows'] as const) {
      const { cards } = renderGrid(3, layout);
      expect(cards.map((card) => card.querySelector('.agi-ds-h3')?.textContent)).toEqual([
        'Title 1',
        'Title 2',
        'Title 3',
      ]);
      expect(cards.map((card) => card.querySelector('.agi-ds-prose')?.textContent)).toEqual([
        'Body 1',
        'Body 2',
        'Body 3',
      ]);
      expect(cards.map((card) => card.querySelector('.agi-ds-eyebrow')?.textContent)).toEqual([
        'Meta 1',
        'Meta 2',
        'Meta 3',
      ]);
    }
  });
});
