import { render, screen } from '@testing-library/react';
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

describe('DocsPage', () => {
  it('uses the public design system, link lists, and shared footer', () => {
    const { container } = render(<DocsPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Build with every AGI surface.' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Web' })).toHaveAttribute('href', '/web');
    const apiReferenceLinks = screen.getAllByRole('link', { name: 'API reference' });
    expect(apiReferenceLinks).toHaveLength(2);
    apiReferenceLinks.forEach((link) => expect(link).toHaveAttribute('href', '/api-docs'));
    expect(screen.getByRole('contentinfo')).toHaveTextContent('AGI footer');
    expect(container.querySelector('.agi-docs-card')).toBeNull();
  });
});
