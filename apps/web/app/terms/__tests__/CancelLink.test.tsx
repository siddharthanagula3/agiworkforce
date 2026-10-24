import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TermsPage from '../page';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));
vi.mock('@shared/components/legal/PolicyContents', () => ({ PolicyContents: () => null }));
vi.mock('@shared/components/legal/PolicyVersionsLink', () => ({
  PolicyVersionsLink: () => null,
}));

describe('terms auto-renewal sentence', () => {
  it('links the word cancel to the billing settings', () => {
    render(<TermsPage />);

    const link = screen.getByRole('link', { name: 'cancel' });

    expect(link).toHaveAttribute('href', '/settings/billing');
    expect(link).toHaveClass('agi-ds-link');
  });

  it('keeps the surrounding sentence word for word', () => {
    render(<TermsPage />);

    const paragraph = screen.getByRole('link', { name: 'cancel' }).closest('p');

    expect(paragraph?.textContent?.replace(/\s+/gu, ' ')).toContain(
      'subscriptions renew automatically at the end of each billing period until you cancel. Cancelling stops the next renewal; access continues through the period you have paid for, and the current period is not automatically refunded. Refund terms are at /refund-policy.',
    );
  });
});
