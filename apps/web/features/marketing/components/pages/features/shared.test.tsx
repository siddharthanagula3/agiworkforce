import type { ComponentProps } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LinkGrid, type LinkCardItem } from './shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: ComponentProps<'a'>) => (
    <a {...props} href={href}>
      {children}
    </a>
  ),
}));

const FULL_SPAN = '1 / -1';

function links(count: number): LinkCardItem[] {
  return Array.from({ length: count }, (_, index) => ({
    meta: `Meta ${index + 1}`,
    title: `Title ${index + 1}`,
    body: `Body ${index + 1}`,
    href: `/path-${index + 1}`,
  }));
}

function spans(count: number) {
  const { container } = render(
    <div data-design="agi">
      <LinkGrid items={links(count)} />
    </div>,
  );
  return Array.from(container.querySelectorAll<HTMLElement>('.agi-ds-card')).map(
    (card) => card.style.gridColumn,
  );
}

describe('LinkGrid', () => {
  it('keeps three cards as three equal columns', () => {
    expect(spans(3)).toEqual(['', '', '']);
  });

  it.each([1, 5])('spans the last of %s cards so an odd row is not left half empty', (count) => {
    const result = spans(count);
    expect(result.at(-1)).toBe(FULL_SPAN);
    expect(result.slice(0, -1).every((span) => span === '')).toBe(true);
  });

  it.each([2, 4])('leaves %s cards in even rows', (count) => {
    expect(spans(count).every((span) => span === '')).toBe(true);
  });
});
