import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/help',
  notFound: () => {
    throw new Error('not found');
  },
}));
vi.mock('@shared/components/agi/AgiMark', () => ({ AgiMark: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import { supportCollectionIndex } from '../collections';
import HelpCollectionPage from '../collections/[id]/page';

describe('the help collection page', () => {
  it('shows the site header menus and a breadcrumb that ends at the collection', async () => {
    const [collection] = supportCollectionIndex().collections;
    expect(collection).toBeDefined();
    render(await HelpCollectionPage({ params: Promise.resolve({ id: collection?.id ?? '' }) }));

    const primary = screen.getByRole('navigation', { name: 'Primary' });
    expect(
      within(primary)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Products', 'Solutions', 'Resources']);

    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getAllByRole(
      'listitem',
    );
    expect(crumbs.map((item) => item.textContent)).toEqual([
      'Help',
      'All collections',
      collection?.label,
    ]);
    expect(crumbs.at(-1)).toHaveAttribute('aria-current', 'page');
  });
});
