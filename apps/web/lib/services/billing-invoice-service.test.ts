import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  list: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@/lib/server/stripe-client', () => ({
  getStripeClient: mocks.client,
  getStripeClientOrNull: mocks.client,
}));

const db = { query: mocks.query } as unknown as DatabaseAdapter;

function invoice(id = 'in_one', overrides: Record<string, unknown> = {}) {
  return {
    id,
    number: '001',
    status: 'paid',
    amount_due: 1200,
    currency: 'usd',
    description: 'Monthly invoice',
    created: 1735689600,
    due_date: null,
    status_transitions: { paid_at: 1735776000 },
    invoice_pdf: 'https://example.com/invoice.pdf',
    hosted_invoice_url: 'https://example.com/invoice',
    customer: 'cus_not_exported',
    metadata: { private: 'not_exported' },
    lines: {
      data: [
        {
          id: 'il_one',
          description: 'Monthly plan',
          amount: 1200,
          quantity: 1,
          period: { start: 1735689600, end: 1738368000 },
        },
      ],
      has_more: false,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  mocks.client.mockReset().mockReturnValue({ invoices: { list: mocks.list } });
  mocks.list.mockReset().mockResolvedValue({ data: [], has_more: false });
  mocks.query.mockReset().mockResolvedValue([{ stripe_customer_id: 'cus_owned' }]);
});

describe('billing invoice page metadata', () => {
  it('uses provider pagination rather than treating a full page as truncated', async () => {
    const service = await import('./billing-invoice-service');
    const data = Array.from({ length: service.BILLING_INVOICE_PAGE_LIMIT }, (_, i) =>
      invoice(`in_${i}`),
    );
    mocks.list.mockResolvedValue({ data, has_more: false });

    const page = await service.readUserBillingInvoicePage(db, 'user_1');

    expect(page).toMatchObject({ available: true, hasMore: false, truncatedLineItems: [] });
    expect(page.invoices).toHaveLength(service.BILLING_INVOICE_PAGE_LIMIT);
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith({
      customer: 'cus_owned',
      limit: service.BILLING_INVOICE_PAGE_LIMIT,
    });
    expect(mocks.query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('where user_id = $1'),
      ['user_1'],
    );
  });

  it('reports a smaller page as truncated when the provider says more exist', async () => {
    const service = await import('./billing-invoice-service');
    mocks.list.mockResolvedValue({ data: [invoice()], has_more: true });

    const page = await service.readUserBillingInvoicePage(db, 'user_1');

    expect(page.hasMore).toBe(true);
    expect(page.invoices).toHaveLength(1);
    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it('reports each truncated embedded list independently of the invoice page', async () => {
    const service = await import('./billing-invoice-service');
    const first = invoice('in_first');
    const second = invoice('in_second');
    const data = [
      { ...first, lines: { ...first.lines, has_more: true } },
      { ...second, lines: { data: [], has_more: true } },
      invoice('in_complete'),
    ];
    mocks.list.mockResolvedValue({ data, has_more: false });

    const page = await service.readUserBillingInvoicePage(db, 'user_1');

    expect(page.hasMore).toBe(false);
    expect(page.truncatedLineItems).toEqual([
      { invoiceId: 'in_first', returnedCount: 1 },
      { invoiceId: 'in_second', returnedCount: 0 },
    ]);
    expect(page.invoices.map((entry) => entry.line_items.length)).toEqual([1, 0, 1]);
    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it('keeps the existing DTO-only array wrapper', async () => {
    const service = await import('./billing-invoice-service');
    mocks.list.mockResolvedValue({ data: [invoice()], has_more: true });

    const invoices = await service.listUserBillingInvoices(db, 'user_1');

    expect(invoices).toEqual([
      {
        id: 'in_one',
        number: '001',
        status: 'paid',
        amount: 1200,
        currency: 'usd',
        description: 'Monthly invoice',
        created_at: '2025-01-01T00:00:00.000Z',
        due_date: null,
        paid_at: '2025-01-02T00:00:00.000Z',
        invoice_pdf: 'https://example.com/invoice.pdf',
        hosted_invoice_url: 'https://example.com/invoice',
        line_items: [
          {
            id: 'il_one',
            description: 'Monthly plan',
            amount: 1200,
            quantity: 1,
            period: { start: '2025-01-01T00:00:00.000Z', end: '2025-02-01T00:00:00.000Z' },
          },
        ],
      },
    ]);
    expect(JSON.stringify(invoices)).not.toContain('not_exported');
    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it('distinguishes an unavailable client from an empty lookup without provider calls', async () => {
    mocks.client.mockReturnValue(null);
    const service = await import('./billing-invoice-service');

    await expect(service.readUserBillingInvoicePage(db, 'user_1')).resolves.toEqual({
      invoices: [],
      available: false,
      hasMore: false,
      truncatedLineItems: [],
    });
    await expect(service.listUserBillingInvoices(db, 'user_1')).resolves.toEqual([]);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it.each([{ rows: [] }, { rows: [{ stripe_customer_id: null }] }])(
    'reports a verified unlinked subject as empty: %j',
    async ({ rows }) => {
      mocks.query.mockResolvedValue(rows);
      const service = await import('./billing-invoice-service');

      await expect(service.readUserBillingInvoicePage(db, 'user_1')).resolves.toEqual({
        invoices: [],
        available: true,
        hasMore: false,
        truncatedLineItems: [],
      });
      expect(mocks.query).toHaveBeenCalledOnce();
      expect(mocks.list).not.toHaveBeenCalled();
    },
  );

  it('reports a provider-confirmed empty page as available', async () => {
    const service = await import('./billing-invoice-service');

    await expect(service.readUserBillingInvoicePage(db, 'user_1')).resolves.toEqual({
      invoices: [],
      available: true,
      hasMore: false,
      truncatedLineItems: [],
    });
    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it.each([undefined, null, 'false', 0])('rejects unknown outer pagination: %j', async (value) => {
    mocks.list.mockResolvedValue({ data: [invoice()], has_more: value });
    const service = await import('./billing-invoice-service');

    await expect(service.readUserBillingInvoicePage(db, 'user_1')).rejects.toThrow(
      'pagination metadata',
    );
    await expect(service.listUserBillingInvoices(db, 'user_1')).rejects.toThrow(
      'pagination metadata',
    );
  });

  it.each([undefined, null, 'false', 0])(
    'rejects unknown embedded pagination: %j',
    async (value) => {
      const data = invoice();
      mocks.list.mockResolvedValue({
        data: [{ ...data, lines: { ...data.lines, has_more: value } }],
        has_more: false,
      });
      const service = await import('./billing-invoice-service');

      await expect(service.readUserBillingInvoicePage(db, 'user_1')).rejects.toThrow(
        'pagination metadata',
      );
      await expect(service.listUserBillingInvoices(db, 'user_1')).rejects.toThrow(
        'pagination metadata',
      );
    },
  );

  it.each(['database', 'provider', 'mapping'])('propagates a %s failure', async (stage) => {
    const service = await import('./billing-invoice-service');
    if (stage === 'database') mocks.query.mockRejectedValue(new Error('database unavailable'));
    if (stage === 'provider') mocks.list.mockRejectedValue(new Error('provider unavailable'));
    if (stage === 'mapping')
      mocks.list.mockResolvedValue({
        data: [invoice('in_bad', { created: Infinity })],
        has_more: false,
      });

    await expect(service.readUserBillingInvoicePage(db, 'user_1')).rejects.toBeInstanceOf(Error);
    expect(mocks.list).toHaveBeenCalledTimes(stage === 'database' ? 0 : 1);
  });
});
