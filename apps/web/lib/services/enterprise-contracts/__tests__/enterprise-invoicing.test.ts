import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMocks }));

const recordAuditEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent }));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  assertInvoiceIssuable,
  contractInvoiceDueDate,
  contractViewOf,
  invoiceRefusalsFor,
  permittedOfflineMethods,
  readEnterpriseInvoicePositions,
  reportOfflinePayment,
  type CommercialAgreement,
  type CommercialAgreementTerms,
} from '..';

const ORGANIZATION_ID = '00000000-0000-4000-8000-0000000000aa';
const IN_TERM = '2026-06-01';
const INVOICE_ID = 'in_1';

function terms(overrides: Partial<CommercialAgreementTerms> = {}): CommercialAgreementTerms {
  return {
    customerLegalEntity: 'Northwind Traders, Inc.',
    committedSeats: 250,
    seatUnitPriceCents: 120_000,
    billingCadence: 'annual',
    billingCurrency: 'usd',
    contractTermStart: '2026-01-01',
    contractTermEnd: '2026-12-31',
    expiryGraceDays: 0,
    paymentTermsDays: 30,
    paymentMethodPolicy: 'invoice_ach_wire',
    purchaseOrderRequired: true,
    invoiceRecipientEmails: ['ap@northwind.example'],
    includedUsageCentsPerPeriod: 500_000,
    committedUsageBlockCents: 0,
    minimumAnnualSpendCents: 0,
    overageStripePriceId: 'price_overage_1',
    supportTier: 'enterprise',
    procurementReference: 'PO-4411',
    billingContact: { name: 'Accounts Payable', email: 'ap@northwind.example' },
    procurementContact: { name: 'Dana Buyer', email: 'buyer@northwind.example' },
    taxExemptStatus: 'none',
    ...overrides,
  };
}

function agreement(overrides: Partial<CommercialAgreementTerms> = {}): CommercialAgreement {
  return {
    id: 'agreement_1',
    organizationId: ORGANIZATION_ID,
    version: 1,
    status: 'executed',
    changeKind: 'initial',
    supersedesVersion: null,
    terms: terms(overrides),
    signature: {
      orderFormReference: 'OF-2026-001',
      provider: 'docusign',
      envelopeId: 'env_1',
      signedAt: '2025-12-15T10:00:00.000Z',
      signerName: 'Dana Buyer',
      signerEmail: 'buyer@northwind.example',
    },
    amendmentReason: null,
    authoredBy: 'deal-desk',
    supersededAt: null,
    terminatedAt: null,
    terminationReason: null,
    createdAt: '2025-12-15T10:00:00.000Z',
  };
}

const ISSUABLE_REQUEST = {
  currency: 'usd',
  collectionMethod: 'send_invoice',
  paymentMethodTypes: ['ach_credit_transfer'],
};

interface InvoiceFixture {
  stripe_invoice_id: string;
  invoice_number: string | null;
  status: string;
  currency: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  due_at: string | null;
  voided_at: string | null;
}

function invoice(overrides: Partial<InvoiceFixture> = {}): InvoiceFixture {
  return {
    stripe_invoice_id: INVOICE_ID,
    invoice_number: 'INV-1',
    status: 'open',
    currency: 'usd',
    amount_due_cents: 100_000,
    amount_paid_cents: 0,
    due_at: '2026-07-01T00:00:00.000Z',
    voided_at: null,
    ...overrides,
  };
}

/**
 * The invoice mirror and the offline payment log, as the two tables the
 * settlement read joins. Inserts honour the unique remittance key.
 */
function billingDb(invoices: InvoiceFixture[], reconciled: Record<string, unknown>[] = []) {
  const payments: Record<string, unknown>[] = [...reconciled];
  let nextId = 1;

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('from public.organization_billing_invoices')) {
      const applied = (row: InvoiceFixture, reconciled: boolean) =>
        payments
          .filter(
            (payment) =>
              payment['stripe_invoice_id'] === row.stripe_invoice_id &&
              (payment['reconciled_at'] !== null) === reconciled,
          )
          .reduce((total, payment) => total + Number(payment['amount_cents']), 0);
      return invoices.map((row) => ({
        ...row,
        reconciled_offline_cents: applied(row, true),
        reported_offline_cents: applied(row, false),
      }));
    }
    if (sql.includes('from public.enterprise_offline_payment_records')) {
      return payments.filter(
        (payment) =>
          payment['stripe_invoice_id'] === params[1] &&
          payment['remittance_reference'] === params[2],
      );
    }
    if (sql.includes('insert into public.enterprise_offline_payment_records')) {
      const duplicate = payments.some(
        (payment) =>
          payment['stripe_invoice_id'] === params[1] &&
          payment['remittance_reference'] === params[5],
      );
      if (duplicate) return [];
      const row = {
        id: `payment_${nextId++}`,
        stripe_invoice_id: params[1],
        method: params[2],
        amount_cents: params[3],
        currency: params[4],
        remittance_reference: params[5],
        received_on: params[6],
        reported_by: params[7],
        reconciled_at: null,
        created_at: '2026-06-01T00:00:00.000Z',
      };
      payments.push(row);
      return [row];
    }
    return [];
  });

  const adapter = {
    query,
    execute: vi.fn(async () => 0),
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> => fn(adapter),
  } as unknown as DatabaseAdapter;

  return { db: adapter, payments };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('an invoice the contract does not permit is not issued', () => {
  it('issues under terms that are all present', () => {
    expect(invoiceRefusalsFor(agreement(), ISSUABLE_REQUEST, IN_TERM)).toEqual([]);
    expect(() => assertInvoiceIssuable(agreement(), ISSUABLE_REQUEST, IN_TERM)).not.toThrow();
  });

  it('refuses an invoice with no PO number when the customer requires one', () => {
    expect(
      invoiceRefusalsFor(agreement({ procurementReference: null }), ISSUABLE_REQUEST, IN_TERM),
    ).toEqual(['purchase_order_required']);
    expect(() =>
      assertInvoiceIssuable(agreement({ procurementReference: null }), ISSUABLE_REQUEST, IN_TERM),
    ).toThrow(/cannot be issued/i);
  });

  it('refuses an invoice with no recipient and no negotiated rate', () => {
    expect(
      invoiceRefusalsFor(
        agreement({ invoiceRecipientEmails: [], seatUnitPriceCents: null }),
        ISSUABLE_REQUEST,
        IN_TERM,
      ),
    ).toEqual(['invoice_recipient_missing', 'negotiated_rate_missing']);
  });

  it('refuses an invoice in a currency the contract did not agree', () => {
    expect(
      invoiceRefusalsFor(agreement(), { ...ISSUABLE_REQUEST, currency: 'eur' }, IN_TERM),
    ).toEqual(['currency_not_contracted']);
  });

  it('refuses an invoice once the term has ended', () => {
    expect(invoiceRefusalsFor(agreement(), ISSUABLE_REQUEST, '2027-01-02')).toEqual([
      'contract_not_in_force',
    ]);
  });

  it('refuses a card charge on an agreement that negotiated invoicing', () => {
    expect(
      invoiceRefusalsFor(
        agreement(),
        { currency: 'usd', collectionMethod: 'charge_automatically', paymentMethodTypes: ['card'] },
        IN_TERM,
      ),
    ).toContain('payment_method_not_permitted');
  });

  it('dates the invoice from the negotiated NET term', () => {
    expect(contractInvoiceDueDate(agreement(), '2026-06-01')).toBe('2026-07-01');
    expect(contractInvoiceDueDate(agreement({ paymentTermsDays: 0 }), '2026-06-01')).toBe(
      '2026-06-01',
    );
    expect(contractViewOf(agreement({ paymentTermsDays: 45 }), IN_TERM).paymentTermLabel).toBe(
      'NET 45',
    );
  });

  it('settles no bank transfer on a card-only agreement', () => {
    expect(permittedOfflineMethods(agreement())).toContain('wire');
    expect(permittedOfflineMethods(agreement({ paymentMethodPolicy: 'card_only' }))).toEqual([]);
  });
});

describe('a bank transfer is applied once', () => {
  const transfer = {
    organizationId: ORGANIZATION_ID,
    stripeInvoiceId: INVOICE_ID,
    method: 'wire' as const,
    amountCents: 40_000,
    remittanceReference: 'FED-88123',
    receivedOn: '2026-06-01',
    reportedBy: 'finance-ops',
  };

  it('reports the transfer, settles nothing yet and audits it', async () => {
    const { db, payments } = billingDb([invoice()]);
    const outcome = await reportOfflinePayment(db, agreement(), transfer, IN_TERM);

    expect(outcome.recorded).toBe(true);
    expect(outcome.position).toMatchObject({
      reportedOfflineCents: 40_000,
      reconciledOfflineCents: 0,
      providerPaidCents: 0,
      outstandingCents: 100_000,
      state: 'open',
    });
    expect(payments).toHaveLength(1);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'finance-ops',
        detail: expect.objectContaining({
          reason: 'enterprise_offline_payment_reported',
          resourceId: INVOICE_ID,
        }),
      }),
    );
  });

  it('applies the same remittance reference once, however many times it arrives', async () => {
    const { db, payments } = billingDb([invoice()]);
    const first = await reportOfflinePayment(db, agreement(), transfer, IN_TERM);
    const second = await reportOfflinePayment(db, agreement(), transfer, IN_TERM);

    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
    expect(second.payment.id).toBe(first.payment.id);
    expect(payments).toHaveLength(1);
    expect(second.position.outstandingCents).toBe(100_000);
  });

  it('settles the invoice only once finance has reconciled the transfer', async () => {
    const { db } = billingDb(
      [invoice()],
      [
        {
          id: 'payment_reconciled',
          stripe_invoice_id: INVOICE_ID,
          method: 'wire',
          amount_cents: 100_000,
          currency: 'usd',
          remittance_reference: 'FED-00001',
          received_on: '2026-05-20',
          reported_by: 'finance-ops',
          reconciled_at: '2026-05-21T00:00:00.000Z',
          created_at: '2026-05-20T00:00:00.000Z',
        },
      ],
    );
    const [position] = await readEnterpriseInvoicePositions(db, ORGANIZATION_ID, IN_TERM);
    expect(position).toMatchObject({
      reconciledOfflineCents: 100_000,
      outstandingCents: 0,
      state: 'paid',
    });
  });

  it('refuses a transfer larger than what an unreconciled report already claims', async () => {
    const { db } = billingDb([invoice()]);
    await reportOfflinePayment(db, agreement(), transfer, IN_TERM);
    await expect(
      reportOfflinePayment(
        db,
        agreement(),
        { ...transfer, amountCents: 100_001, remittanceReference: 'FED-88124' },
        IN_TERM,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses a transfer larger than what is outstanding', async () => {
    const { db, payments } = billingDb([invoice()]);
    await expect(
      reportOfflinePayment(db, agreement(), { ...transfer, amountCents: 100_001 }, IN_TERM),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(payments).toEqual([]);
  });

  it('refuses a transfer against a draft or a voided invoice', async () => {
    const draft = billingDb([invoice({ status: 'draft' })]);
    await expect(
      reportOfflinePayment(draft.db, agreement(), transfer, IN_TERM),
    ).rejects.toMatchObject({ statusCode: 409 });

    const voided = billingDb([invoice({ voided_at: '2026-05-02T00:00:00.000Z' })]);
    await expect(
      reportOfflinePayment(voided.db, agreement(), transfer, IN_TERM),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses a transfer on an agreement that settles by card', async () => {
    const { db } = billingDb([invoice()]);
    await expect(
      reportOfflinePayment(db, agreement({ paymentMethodPolicy: 'card_only' }), transfer, IN_TERM),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses a transfer against an invoice of another workspace', async () => {
    const { db } = billingDb([invoice()]);
    await expect(
      reportOfflinePayment(
        db,
        agreement(),
        { ...transfer, stripeInvoiceId: 'in_someone_else' },
        IN_TERM,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses a transfer with no bank reference to identify it by', async () => {
    const { db } = billingDb([invoice()]);
    await expect(
      reportOfflinePayment(db, agreement(), { ...transfer, remittanceReference: '  ' }, IN_TERM),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('what each invoice still owes', () => {
  it.each([
    [{ status: 'draft' }, 'draft', 100_000],
    [{}, 'open', 100_000],
    [{ amount_paid_cents: 40_000 }, 'partially_paid', 60_000],
    [{ amount_paid_cents: 100_000 }, 'paid', 0],
    [{ due_at: '2026-01-01T00:00:00.000Z' }, 'overdue', 100_000],
    [{ status: 'uncollectible' }, 'uncollectible', 100_000],
    [{ voided_at: '2026-05-01T00:00:00.000Z' }, 'void', 0],
  ])('reads %o as %s', async (overrides, state, outstanding) => {
    const { db } = billingDb([invoice(overrides)]);
    const [position] = await readEnterpriseInvoicePositions(db, ORGANIZATION_ID, IN_TERM);
    expect(position?.state).toBe(state);
    expect(position?.outstandingCents).toBe(outstanding);
  });

  it('keeps each currency on its own invoice rather than summing them', async () => {
    const { db } = billingDb([
      invoice(),
      invoice({ stripe_invoice_id: 'in_2', currency: 'eur', amount_due_cents: 50_000 }),
    ]);
    const positions = await readEnterpriseInvoicePositions(db, ORGANIZATION_ID, IN_TERM);
    expect(positions.map((position) => position.currency)).toEqual(['usd', 'eur']);
    expect(positions.map((position) => position.outstandingCents)).toEqual([100_000, 50_000]);
  });
});
