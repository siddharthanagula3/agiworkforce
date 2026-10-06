import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DocsPage from './page';

vi.mock('@shared/components/layout/Header', () => ({
  Header: () => <header>AGI navigation</header>,
}));

vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <footer>AGI footer</footer>,
}));

vi.mock('./doc-index', () => ({
  documentationIndex: () => ({ groups: [], documentCount: 0, newestUpdate: null }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/docs',
}));

describe('DocsPage', () => {
  it('is a documentation layout: a plain title, page navigation, link lists, and the shared footer', async () => {
    const { container } = render(await DocsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole('heading', { level: 1, name: 'Documentation' })).toBeVisible();
    expect(container.querySelector('.agi-ds-hero, .agi-ds-eyebrow')).toBeNull();
    expect(
      screen.getAllByRole('navigation', { name: 'Documentation pages' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /^Web\b/ })).toHaveAttribute('href', '/web');
    const apiReferenceLinks = within(screen.getByRole('main')).getAllByRole('link', {
      name: /^API reference/,
    });
    expect(apiReferenceLinks).toHaveLength(2);
    apiReferenceLinks.forEach((link) => expect(link).toHaveAttribute('href', '/api-docs'));
    expect(screen.getByRole('contentinfo')).toHaveTextContent('AGI footer');
    expect(container.querySelector('.agi-docs-card')).toBeNull();
  });

  it('marks the overview as the current page in the navigation', async () => {
    render(await DocsPage({ searchParams: Promise.resolve({}) }));

    const current = screen
      .getAllByRole('link', { name: 'Overview' })
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.length).toBeGreaterThan(0);
    current.forEach((link) => expect(link).toHaveAttribute('href', '/docs'));
  });
});
