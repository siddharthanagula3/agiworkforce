import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Header } from '@shared/components/layout/Header';

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: null, isLoaded: true }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');

function blockAt(source: string, index: number): string {
  const start = source.indexOf('{', index);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unterminated block');
}

function ruleFor(source: string, selector: string): string {
  const index = source.indexOf(selector);
  expect(index, `${selector} missing`).toBeGreaterThan(-1);
  return blockAt(source, index + selector.length);
}

const narrowMediaBlock = (() => {
  const marker = '@media (max-width: 900px)';
  let from = 0;
  for (;;) {
    const index = css.indexOf(marker, from);
    expect(index, 'marketing-nav breakpoint missing').toBeGreaterThan(-1);
    const block = blockAt(css, index);
    if (block.includes('.agi-top-nav-desktop')) return block;
    from = index + marker.length;
  }
})();

describe('marketing nav below the 900px breakpoint', () => {
  it('collapses only the nav links and the desktop action row', () => {
    expect(ruleFor(narrowMediaBlock, '.agi-top-actions-desktop')).toContain('display: none');
    expect(ruleFor(narrowMediaBlock, '.agi-top-mobile-controls')).toContain('display: inline-flex');
  });

  it('keeps the primary CTA visible outside the hamburger', () => {
    expect(ruleFor(css, "[data-design='agi'] .agi-top-cta-compact")).toContain('display: none');
    expect(ruleFor(narrowMediaBlock, '.agi-top-cta-compact')).toContain('display: inline-flex');
  });

  it('renders the compact CTA in the header, outside the drawer', () => {
    const { container } = render(<Header />);

    const compact = container.querySelector('.agi-top-cta-compact');
    expect(compact).not.toBeNull();
    expect(compact!.closest('header')).not.toBeNull();
    expect(compact!.querySelector('a')).toHaveAttribute('href', '/login?redirectTo=%2F');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('owns the compact CTA visibility in the stylesheet, not in injected CSS', () => {
    const { container } = render(<Header />);

    expect(container.querySelector('style')).toBeNull();
  });
});
