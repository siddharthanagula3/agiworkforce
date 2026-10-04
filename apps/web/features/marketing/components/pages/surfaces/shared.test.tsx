import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FactGrid, type FactItem } from './shared';

const STYLESHEET = readFileSync(resolve(__dirname, '..', '..', 'system', 'system.css'), 'utf8');
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

function declaredWidth(element: Element): string | null {
  let value: string | null = null;
  for (const rule of Array.from(sheet.sheet?.cssRules ?? [])) {
    if (!(rule instanceof CSSStyleRule) || !rule.style.width) continue;
    let matches = false;
    try {
      matches = element.matches(rule.selectorText);
    } catch {
      matches = false;
    }
    if (matches) value = rule.style.width;
  }
  return value;
}

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
