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
    const link = screen.getByRole('link', { name: /View INV-7/ });
    expect(link.getAttribute('href')).toBe('https://invoice.stripe.com/i/abc');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing for a workspace without an enterprise contract', () => {
    state({ contract: null, invoices: [] });

    const { container } = render(<WorkspaceEnterpriseContract />);

    expect(container.textContent).toBe('');
  });

  it('explains a missing record for a contract-priced workspace', () => {
    state({ contract: null, invoices: [] });
    render(<WorkspaceEnterpriseContract showMissingContract />);
    expect(screen.getByText('No contract is on record for this workspace.')).toBeVisible();
  });

  it('does not describe denied contract access as a missing contract', () => {
    state(null);
    const { container } = render(<WorkspaceEnterpriseContract showMissingContract />);
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

function invoice(index: number) {
  const month = String((index % 12) + 1).padStart(2, '0');
  return {
    invoiceNumber: `INV-${index}`,
    status: 'paid',
    amountDueCents: 1_000_00,
    amountPaidCents: 1_000_00,
    currency: 'usd',
    periodStart: `2026-${month}-01T00:00:00.000Z`,
    periodEnd: `2026-${month}-28T00:00:00.000Z`,
    dueAt: `2026-${month}-15T00:00:00.000Z`,
    paidAt: `2026-${month}-10T00:00:00.000Z`,
    hostedInvoiceUrl: `https://invoice.stripe.com/i/${index}`,
    invoicePdfUrl: `https://invoice.stripe.com/i/${index}/pdf`,
  };
}

describe('WorkspaceEnterpriseContract accessibility', () => {
  it('names the invoice table, so it is not an unlabelled table in a screen reader', () => {
    state({ contract: contract(), invoices: [invoice(1)] });

    render(<WorkspaceEnterpriseContract />);

    const table = screen.getByRole('table', { name: /Invoices/ });
    expect(table.querySelector('caption')).toBeTruthy();
  });

  it('marks every header cell with its direction, so a cell announces its column', () => {
    state({ contract: contract(), invoices: [invoice(1)] });

    render(<WorkspaceEnterpriseContract />);

    const columns = screen.getAllByRole('columnheader');
    expect(columns).toHaveLength(6);
    expect(columns.every((cell) => cell.getAttribute('scope') === 'col')).toBe(true);
    const rows = screen.getAllByRole('rowheader');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute('scope')).toBe('row');
  });

  it('gives each row link a name of its own, because "View" repeated is not a name', () => {
    state({ contract: contract(), invoices: [invoice(1), invoice(2)] });

    render(<WorkspaceEnterpriseContract />);

    const names = screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('View INV-1, opens in a new tab');
    expect(names).toContain('Download INV-2 as PDF, opens in a new tab');
  });

  it('names a link for an invoice that has no number yet', () => {
    state({
      contract: contract(),
      invoices: [{ ...invoice(1), invoiceNumber: null }],
    });

    render(<WorkspaceEnterpriseContract />);

    expect(screen.getByRole('link', { name: /View the invoice for/ })).toBeTruthy();
  });

  it('announces a load failure instead of only drawing it', () => {
    state(undefined, { isError: true, error: new Error('nope') });

    render(<WorkspaceEnterpriseContract />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('stays one accessible table at the server-side history cap, which is why it is not virtualized', () => {
    // enterprise-billing-service caps the query at ENTERPRISE_INVOICE_HISTORY_LIMIT
    // rows, so the table is bounded before it reaches this component.
    const invoices = Array.from({ length: 24 }, (_, index) => invoice(index + 1));
    state({ contract: contract(), invoices });

    render(<WorkspaceEnterpriseContract />);

    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.getAllByRole('rowheader')).toHaveLength(24);
    expect(screen.getAllByRole('link')).toHaveLength(48);
  });

  it('tells a customer where the invoices older than the ones shown live', () => {
    state({ contract: contract(), invoices: [invoice(1)] });

    render(<WorkspaceEnterpriseContract />);

    expect(screen.getByText(/Older invoices stay with the billing provider/)).toBeTruthy();
  });
});
