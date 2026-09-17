import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseEnterpriseContract } = vi.hoisted(() => ({
  mockUseEnterpriseContract: vi.fn(),
}));

vi.mock('../../hooks/use-enterprise-contract', () => ({
  useEnterpriseContract: mockUseEnterpriseContract,
  ENTERPRISE_CONTRACT_QUERY_KEY: ['workspace', 'enterprise-contract'],
}));

import { WorkspaceEnterpriseContract } from '../WorkspaceEnterpriseContract';

function contract(overrides: Record<string, unknown> = {}) {
  return {
    customerLegalEntity: 'Acme Corp Ltd.',
    procurementReference: 'PO-99',
    termStart: '2026-01-01',
    termEnd: '2026-12-31',
    billingCadence: 'annual',
    committedSeats: 250,
    supportTier: 'platinum',
    paymentTermsDays: 45,
    taxExemptStatus: 'exempt',
    collectionStage: 'current',
    ended: false,
    billingContact: { name: 'Accounts Payable', email: 'ap@example.com' },
    procurementContact: null,
    ...overrides,
  };
}

function state(data: unknown, overrides: Record<string, unknown> = {}) {
  mockUseEnterpriseContract.mockReturnValue({
    data,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WorkspaceEnterpriseContract', () => {
  it('shows contract terms, contacts, payment terms and tax status read only', () => {
    state({
      contract: contract(),
      invoices: [
        {
          invoiceNumber: 'INV-7',
          status: 'open',
          amountDueCents: 1_250_000,
          amountPaidCents: 0,
          currency: 'usd',
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-12-31T00:00:00.000Z',
          dueAt: '2026-02-15T00:00:00.000Z',
          paidAt: null,
          hostedInvoiceUrl: 'https://invoice.stripe.com/i/abc',
          invoicePdfUrl: null,
        },
      ],
    });

    render(<WorkspaceEnterpriseContract />);

    expect(screen.getByText('Acme Corp Ltd.')).toBeTruthy();
    expect(screen.getByText('Net 45')).toBeTruthy();
    expect(screen.getByText('Tax exempt')).toBeTruthy();
    expect(screen.getByText('Accounts Payable, ap@example.com')).toBeTruthy();
    expect(screen.getAllByText('Not on record').length).toBeGreaterThan(0);
    expect(screen.getByText('INV-7')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'View' });
    expect(link.getAttribute('href')).toBe('https://invoice.stripe.com/i/abc');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing for a workspace without an enterprise contract', () => {
    state({ contract: null, invoices: [] });

    const { container } = render(<WorkspaceEnterpriseContract />);

    expect(container.textContent).toBe('');
  });

  it('states when no invoices have been issued', () => {
    state({ contract: contract({ paymentTermsDays: null }), invoices: [] });

    render(<WorkspaceEnterpriseContract />);

    expect(screen.getByText('No invoices have been issued on this contract yet.')).toBeTruthy();
    expect(screen.getByText('As stated on each invoice')).toBeTruthy();
  });

  it('announces loading through the shared spinner', () => {
    state(undefined, { isPending: true });

    render(<WorkspaceEnterpriseContract />);

    expect(screen.getByRole('status')).toBeTruthy();
  });
});
