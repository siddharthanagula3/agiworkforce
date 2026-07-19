import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@features/billing/pages/BillingDashboard', () => ({
  default: () => <div>Canonical percentage usage</div>,
}));

vi.mock('@features/chat/components/tokens/TokenBalanceDisplay', () => ({
  TokenBalanceDisplay: () => <div>Duplicate usage summary</div>,
}));

vi.mock('@features/chat/components/tokens/TokenAnalyticsDashboard', () => ({
  TokenAnalyticsDashboard: () => <div>Legacy exact token and dollar analytics</div>,
}));

import BillingPage from './page';

describe('BillingPage', () => {
  it('uses the canonical percentage-only billing dashboard without legacy usage surfaces', () => {
    render(<BillingPage />);

    expect(screen.getByText('Canonical percentage usage')).toBeInTheDocument();
    expect(screen.queryByText('Duplicate usage summary')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy exact token and dollar analytics')).not.toBeInTheDocument();
  });
});
