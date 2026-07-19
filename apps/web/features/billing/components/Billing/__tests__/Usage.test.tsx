import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('@agiworkforce/ui', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Badge: Passthrough,
    Card: Passthrough,
    CardContent: Passthrough,
    CardDescription: Passthrough,
    CardHeader: Passthrough,
    CardTitle: Passthrough,
    Button: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
    Progress: ({ value }: { value: number }) => <div data-testid="progress" data-value={value} />,
  };
});

import { Usage } from '../Usage';
import type { BillingInfo } from '../types';

describe('Billing Usage', () => {
  it('renders plan percentage and reset without private usage economics', () => {
    const billing: BillingInfo = {
      plan: 'pro',
      status: 'active',
      current_period_start: '2026-07-01T00:00:00.000Z',
      current_period_end: '2026-08-01T00:00:00.000Z',
      price: 20,
      currency: 'USD',
      features: [],
      usage: { totalTokens: 50, totalLimit: 100, totalCost: 7.25, llmUsage: [] },
      invoices: [],
    };

    render(
      <Usage
        billing={billing}
        isManagingBilling={false}
        invoicesLoading={false}
        paymentMethodsLoading={false}
        paymentMethodsData={[]}
        onManageBilling={vi.fn()}
        onDownloadInvoice={vi.fn()}
        formatCurrency={(amount) => `$${amount.toFixed(2)}`}
        formatDate={() => 'August 1, 2026'}
      />,
    );

    expect(screen.getByText('50% used')).toBeTruthy();
    expect(screen.getByText(/resets august 1, 2026/i)).toBeTruthy();
    expect(screen.queryByText(/100 credits/i)).toBeNull();
    expect(screen.queryByText(/\$7\.25/)).toBeNull();
    expect(screen.queryByText(/total cost/i)).toBeNull();
  });
});
