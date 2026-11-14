import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { InvoiceList } from '../invoices/InvoiceList';

const PAID_INVOICE = {
  id: 'in_1',
  number: 'AGI-0001',
  status: 'paid',
  amount: 2000,
  currency: 'usd',
  created_at: '2026-09-01T00:00:00.000Z',
  hosted_invoice_url: 'https://billing.example/invoice/in_1',
  invoice_pdf: 'https://billing.example/invoice/in_1.pdf',
};

function mockInvoices(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async () => ({ ok, status, json: async () => body }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('billing invoices page', () => {
  it('lists each invoice with its receipt links', async () => {
    const fetchMock = mockInvoices({ invoices: [PAID_INVOICE] });

    render(<InvoiceList />);

    await waitFor(() => expect(screen.getByText('AGI-0001')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/billing/invoices',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute(
      'href',
      PAID_INVOICE.hosted_invoice_url,
    );
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute(
      'href',
      PAID_INVOICE.invoice_pdf,
    );
    expect(screen.getByText('paid')).toBeInTheDocument();
  });

  it('says an invoice has no receipt yet rather than rendering a dead link', async () => {
    mockInvoices({
      invoices: [{ ...PAID_INVOICE, hosted_invoice_url: null, invoice_pdf: null }],
    });

    render(<InvoiceList />);

    await waitFor(() => expect(screen.getByText('Not issued yet')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'View' })).toBeNull();
  });

  it('names the empty state instead of showing an empty table', async () => {
    mockInvoices({ invoices: [] });

    render(<InvoiceList />);

    await waitFor(() => expect(screen.getByText(/No invoices yet/u)).toBeInTheDocument());
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('reports a failed load and points at the portal rather than claiming no invoices', async () => {
    mockInvoices({}, false, 500);

    render(<InvoiceList />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong on our side. Try again shortly.');
    expect(alert).not.toHaveTextContent('500');
    expect(alert).toHaveTextContent(/billing portal/u);
  });

  it('says when older invoices are not in the list instead of presenting it as complete', async () => {
    mockInvoices({ invoices: [PAID_INVOICE], available: true, hasMore: true });

    render(<InvoiceList />);

    await waitFor(() => expect(screen.getByText('AGI-0001')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent(/1 most recent invoices/u);
    expect(screen.getByRole('status')).toHaveTextContent(/billing portal/u);
  });

  it('does not call an unavailable invoice source an empty history', async () => {
    mockInvoices({ invoices: [], available: false, hasMore: false });

    render(<InvoiceList />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/cannot be shown/u));
    expect(screen.queryByText(/No invoices yet/u)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('billing invoices page on a phone', () => {
  it('leads back to Settings, Billing from a 48px top row shown only below md', async () => {
    mockInvoices({ invoices: [] });
    const { default: BillingInvoicesPage } = await import('../invoices/page');

    render(<BillingInvoicesPage />);

    const back = screen.getByRole('link', { name: 'Back to billing' });
    expect(back.getAttribute('href')).toBe('/settings/billing');
    expect(back.className).toContain('min-h-11');
    expect(back.parentElement!.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['h-12', 'md:hidden']),
    );
  });
});
