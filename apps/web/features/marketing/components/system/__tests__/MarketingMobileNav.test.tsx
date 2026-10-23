import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const viewed = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({ usePathname: () => viewed.pathname }));

import { MarketingMobileNav } from '../MarketingMobileNav';
import { NAV_GROUPS } from '../nav';

const GROUP_INDEXES = NAV_GROUPS.flatMap((group) => (group.footer ? [group.footer] : []));

async function openMenuAt(pathname: string) {
  viewed.pathname = pathname;
  render(<MarketingMobileNav />);
  await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
  return within(screen.getByRole('dialog')).getByRole('navigation', { name: 'Site' });
}

const destinations = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link')
    .map((link) => ({ label: link.textContent, href: link.getAttribute('href') }));

describe('the phone menu', () => {
  it('links every destination the header menus list', async () => {
    const links = destinations(await openMenuAt('/'));

    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(links, item.href).toContainEqual({ label: item.label, href: item.href });
      }
    }
  });

  it('ends each group with the index link its header panel ends with', async () => {
    const links = destinations(await openMenuAt('/'));

    expect(GROUP_INDEXES.map((index) => index.href)).toEqual(['/solutions']);
    for (const index of GROUP_INDEXES) {
      expect(links, index.href).toContainEqual({ label: index.label, href: index.href });
    }
  });

  it.each([
    ['/features', ['/features']],
    ['/features/voice', ['/features']],
    ['/download', ['/download']],
  ])('marks only the page being viewed as current on %s', async (pathname, expected) => {
    const nav = await openMenuAt(pathname);
    const current = within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.getAttribute('href'));

    expect(current).toEqual(expected);
  });
});
