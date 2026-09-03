import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import DisclaimerPage from './page';

describe('DisclaimerPage', () => {
  it('states when the page was last updated', () => {
    render(<DisclaimerPage />);

    expect(
      screen.getByText(new RegExp(`Last updated:\\s*${POLICY_LAST_UPDATED.disclaimer}`)),
    ).toBeInTheDocument();
  });
});
