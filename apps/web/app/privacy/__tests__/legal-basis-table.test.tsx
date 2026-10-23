import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import PrivacyPage from '../page';
import { sectionWords } from './legal-section-text';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));
vi.mock('@shared/components/legal/PolicyContents', () => ({ PolicyContents: () => null }));
vi.mock('@shared/components/legal/PolicyVersionsLink', () => ({
  PolicyVersionsLink: () => null,
}));

function withoutHeader(section: HTMLElement): HTMLElement {
  const copy = section.cloneNode(true) as HTMLElement;
  copy.querySelector('thead')?.remove();
  return copy;
}

function renderBasisSection(): HTMLElement {
  const { container } = render(<PrivacyPage />);
  const section = container.querySelector<HTMLElement>('#s-03');
  if (!section) throw new Error('privacy section s-03 did not render');
  return section;
}

describe('privacy legal-basis section', () => {
  it('keeps every word and link target exactly as published before the table', () => {
    const before = readFileSync(
      join(__dirname, 'fixtures', 'legal-basis-section.txt'),
      'utf8',
    ).trim();

    expect(sectionWords(withoutHeader(renderBasisSection())).join(' ')).toBe(before);
  });

  it('heads the table with exactly Purpose and Legal basis', () => {
    const table = within(renderBasisSection()).getByRole('table');
    const headings = within(table).getAllByRole('columnheader');

    expect(headings.map((heading) => heading.textContent)).toEqual(['Purpose', 'Legal basis']);
    expect(headings[0]?.getAttribute('colspan')).toBe('2');
  });

  it('presents one body row per purpose as a three column table', () => {
    const table = within(renderBasisSection()).getByRole('table', {
      name: 'How we use it, and on what basis',
    });
    const rows = within(table).getAllByRole('row').slice(1);

    expect(rows).toHaveLength(12);
    for (const row of rows) {
      expect(within(row).getAllByRole('rowheader')).toHaveLength(1);
      expect(within(row).getAllByRole('cell')).toHaveLength(2);
    }
  });

  it('puts the data in the second column and the basis in the third', () => {
    const table = within(renderBasisSection()).getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);

    for (const row of rows) {
      const [data, basis] = within(row).getAllByRole('cell');
      expect(data?.textContent).toMatch(/^Data used:/u);
      expect(basis?.textContent).toMatch(/^Basis:/u);
    }
  });

  it('keeps the purpose line of the marketing email row with its data', () => {
    const table = within(renderBasisSection()).getByRole('table');
    const row = within(table).getByRole('row', { name: /Marketing email/u });
    const [data, basis] = within(row).getAllByRole('cell');

    expect(data?.textContent).toMatch(/Purpose:/u);
    expect(basis?.textContent).not.toMatch(/Purpose:/u);
  });
});
