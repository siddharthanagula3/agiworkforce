import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Ledger, Prose } from '@/features/marketing/components/system';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import { ReleaseNotesPage } from '../ReleaseNotesPage';

const STYLESHEET = readFileSync(
  resolve(__dirname, '../../../features/marketing/components/system/system.css'),
  'utf8',
);

const BEFORE = '::before';

let sheet: HTMLStyleElement;

beforeEach(() => {
  sheet = document.createElement('style');
  sheet.textContent = STYLESHEET;
  document.head.append(sheet);
});

afterEach(() => {
  sheet.remove();
});

function coarsePointerStyle(element: Element, pseudo?: typeof BEFORE): Record<string, string> {
  const declared: Record<string, string> = {};
  for (const rule of Array.from(sheet.sheet?.cssRules ?? [])) {
    if (!(rule instanceof CSSMediaRule) || !/\(pointer:\s*coarse\)/.test(rule.media.mediaText)) {
      continue;
    }
    for (const inner of Array.from(rule.cssRules)) {
      if (!(inner instanceof CSSStyleRule)) continue;
      if (pseudo && !inner.selectorText.endsWith(pseudo)) continue;
      const selector = pseudo ? inner.selectorText.slice(0, -pseudo.length) : inner.selectorText;
      let matches = false;
      try {
        matches = element.matches(selector);
      } catch {
        matches = false;
      }
      if (!matches) continue;
      for (const property of Array.from(inner.style)) {
        declared[property] = inner.style.getPropertyValue(property);
      }
    }
  }
  return declared;
}

describe('/changelog on a touch screen', () => {
  it('widens the tap area of every release and policy change link to 44px without growing the link', () => {
    render(<ReleaseNotesPage titleId="changelog-title" />);

    for (const caption of ['Releases', 'Policy changes']) {
      const links = within(screen.getByRole('list', { name: caption })).getAllByRole('link');
      expect(links.length, caption).toBeGreaterThan(0);
      for (const link of links) {
        const where = `${caption}: ${link.textContent}`;
        expect(coarsePointerStyle(link), where).toEqual({ position: 'relative' });
        expect(coarsePointerStyle(link, BEFORE), where).toEqual({
          content: '""',
          position: 'absolute',
          inset: '-11px 0',
        });
      }
    }
  });

  it('leaves links that sit inside a sentence at the height of the line', () => {
    render(<ReleaseNotesPage titleId="changelog-title" />);
    const { container } = render(
      <div data-design="agi">
        <Ledger
          rows={[
            {
              label: 'Notice',
              value: (
                <>
                  Objections follow{' '}
                  <a className="agi-ds-link" href="/dpa#s-05">
                    section 05
                  </a>
                  .
                </>
              ),
            },
          ]}
        />
        <Prose>
          Read{' '}
          <a className="agi-ds-link" href="/subprocessors">
            the list
          </a>
          .
        </Prose>
      </div>,
    );

    for (const link of [
      screen.getByRole('link', { name: 'Subscribe with the Atom feed' }),
      screen.getByRole('link', { name: 'section 05 of our data processing addendum' }),
      ...within(container).getAllByRole('link'),
    ]) {
      expect(coarsePointerStyle(link), link.textContent ?? '').toEqual({});
      expect(coarsePointerStyle(link, BEFORE), link.textContent ?? '').toEqual({});
    }
  });
});
