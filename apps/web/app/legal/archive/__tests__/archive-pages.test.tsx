import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import { PolicyVersionsLink } from '@shared/components/legal/PolicyVersionsLink';

import PolicyHistoryPage, { generateStaticParams as historyParams } from '../[policy]/page';
import ArchivedPolicyPage, { generateStaticParams as versionParams } from '../[policy]/[date]/page';

describe('/legal/archive', () => {
  it('lists every dated version of the terms with what changed', async () => {
    render(await PolicyHistoryPage({ params: Promise.resolve({ policy: 'terms' }) }));

    expect(screen.getByRole('heading', { level: 1, name: 'Version history.' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Current version' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Read this version' })).toHaveAttribute(
      'href',
      '/legal/archive/terms/2026-08-11',
    );
    expect(document.body.textContent).toContain('The full text of this version was not kept.');
  });

  it('shows an earlier version in full and says it no longer applies', async () => {
    render(
      await ArchivedPolicyPage({
        params: Promise.resolve({ policy: 'terms', date: '2026-08-11' }),
      }),
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of service.' })).toBeVisible();
    expect(document.body.textContent).toContain('This version no longer applies.');
    expect(document.body.textContent).toContain('Last updated: 2026-08-11.');
    expect(screen.getByRole('heading', { name: '02 · Eligibility and age' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Read the current version' })).toHaveAttribute(
      'href',
      '/terms',
    );
  });

  it('prerenders one page per history and per archived version', () => {
    expect(historyParams()).toContainEqual({ policy: 'acceptable-use' });
    expect(versionParams()).toContainEqual({ policy: 'privacy', date: '2026-09-21' });
    expect(versionParams()).not.toContainEqual({ policy: 'terms', date: '2026-09-22' });
  });

  it('lists a policy introduced after version histories began, without offering previous versions it does not have', async () => {
    render(await PolicyHistoryPage({ params: Promise.resolve({ policy: 'referral-terms' }) }));
    expect(screen.getByRole('link', { name: 'Current version' })).toHaveAttribute(
      'href',
      '/referral-terms',
    );

    const { container } = render(<PolicyVersionsLink policy="referralTerms" />);
    expect(container).toBeEmptyDOMElement();
    render(<PolicyVersionsLink policy="privacy" />);
    expect(screen.getByRole('link', { name: 'Previous versions' })).toHaveAttribute(
      'href',
      '/legal/archive/privacy',
    );
  });
});
