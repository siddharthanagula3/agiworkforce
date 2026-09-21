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
import type Stripe from 'stripe';

import { buildEnterpriseInvoiceRun } from '@/lib/billing/enterprise-invoice-lines';
import { commercialContractView } from '@agiworkforce/types';

import {
  issueEnterpriseInvoice,
  issueEnterpriseInvoiceForRun,
  recordEnterpriseInvoiceEvent,
  syncEnterpriseContractFromSubscription,
} from './enterprise-billing-service';

const ENTERPRISE_PRODUCT_ID = 'prod_enterprise_issue';
const ORGANIZATION_ID = '11111111-2222-3333-4444-555555555555';
const AGREEMENT_ID = '99999999-8888-7777-6666-555555555555';
const CUSTOMER_ID = 'cus_enterprise_issue';

interface Call {
  sql: string;
  params: unknown[];
}

interface AgreementOverrides {
  status?: string;
  contractTermStart?: string;
  contractTermEnd?: string;
  expiryGraceDays?: number;
  terminatedAt?: string | null;
  supersededAt?: string | null;
  purchaseOrderRequired?: boolean;
  procurementReference?: string | null;
  invoiceRecipientEmails?: string[] | null;
  seatUnitPriceCents?: number | null;
  billingCurrency?: string;
  paymentMethodPolicy?: string;
  paymentTermsDays?: number;
  committedSeats?: number;
  billingCadence?: string;
}

function agreementRow(overrides: AgreementOverrides = {}): Record<string, unknown> {
  return {
    id: AGREEMENT_ID,
    organization_id: ORGANIZATION_ID,
    version: 3,
    status: overrides.status ?? 'executed',
    order_form_reference: 'OF-2026-001',
    signature_provider: 'docusign',
    signature_envelope_id: 'env_1',
    signed_at: '2026-01-02T00:00:00.000Z',
    signed_by_name: 'Dana Signer',
    signed_by_email: 'dana@example.com',
    customer_legal_entity: 'Acme Corp Ltd.',
    committed_seats: overrides.committedSeats ?? 250,
    seat_unit_price_cents:
      overrides.seatUnitPriceCents === undefined ? 4_200 : overrides.seatUnitPriceCents,
    billing_cadence: overrides.billingCadence ?? 'quarterly',
    billing_currency: overrides.billingCurrency ?? 'usd',
    contract_term_start: overrides.contractTermStart ?? '2026-01-01',
    contract_term_end: overrides.contractTermEnd ?? '2026-12-31',
    expiry_grace_days: overrides.expiryGraceDays ?? 0,
    payment_terms_days: overrides.paymentTermsDays ?? 45,
    payment_method_policy: overrides.paymentMethodPolicy ?? 'invoice_ach_wire',
    purchase_order_required: overrides.purchaseOrderRequired ?? false,
    invoice_recipient_emails:
      overrides.invoiceRecipientEmails === undefined
        ? ['ap@example.com']
        : overrides.invoiceRecipientEmails,
    included_usage_cents_per_period: 500_000,
    committed_usage_block_cents: 0,
    minimum_annual_spend_cents: 0,
    overage_stripe_price_id: null,
    support_tier: 'platinum',
    procurement_reference:
      overrides.procurementReference === undefined ? 'PO-SIGNED-7' : overrides.procurementReference,
    billing_contact_name: 'Accounts Payable',
    billing_contact_email: 'ap@example.com',
    procurement_contact_name: 'Dana Buyer',
    procurement_contact_email: 'buyer@example.com',
    tax_exempt_status: 'none',
    amendment_reason: null,
    change_kind: 'initial',
    supersedes_version: null,
    authored_by: null,
    superseded_at: overrides.supersededAt ?? null,
    terminated_at: overrides.terminatedAt ?? null,
    termination_reason: overrides.terminatedAt ? 'customer notice' : null,
    created_at: '2026-01-02T00:00:00.000Z',
  };
}

function makeDb(rowsFor: (sql: string, params: unknown[]) => unknown[]) {
  const calls: Call[] = [];
  const record = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return rowsFor(sql, params);
  };
  const db = { query: vi.fn(record), execute: vi.fn(record) } as unknown as DatabaseAdapter;
  return { db, calls };
}

function contractDb(agreement: Record<string, unknown> | null) {
  return makeDb((sql) => {
    if (sql.includes('from subscriptions')) return [{ user_id: 'user_1' }];
    if (sql.includes('from public.organizations')) return [{ id: ORGANIZATION_ID }];
    if (sql.includes('from public.organization_commercial_agreements')) {
      return agreement ? [agreement] : [];
    }
    if (sql.includes('insert into public.organization_billing_contracts')) {
      return [{ organization_id: ORGANIZATION_ID }];
    }
    if (sql.includes('select stripe_customer_id')) return [{ stripe_customer_id: CUSTOMER_ID }];
    return [];
  });
}

function subscriptionFixture(): Stripe.Subscription {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'sub_ent_issue',
    customer: CUSTOMER_ID,
    metadata: {},
    latest_invoice: null,
    items: {
      data: [
        {
          quantity: 11,
          price: {
            id: 'price_ent_issue',
            product: ENTERPRISE_PRODUCT_ID,
            recurring: { interval: 'year', interval_count: 1 },
          },
        },
      ],
    },
    current_period_start: now,
    current_period_end: now + 30 * 24 * 60 * 60,
  } as unknown as Stripe.Subscription;
}

function fakeStripe() {
  const created: Stripe.InvoiceCreateParams[] = [];
  const items: Stripe.InvoiceItemCreateParams[] = [];
  const finalized: string[] = [];
  const stripe = {
    prices: { retrieve: vi.fn() },
    invoices: {
      retrieve: vi.fn(),
      create: vi.fn(async (params: Stripe.InvoiceCreateParams) => {
        created.push(params);
        return { id: 'in_issued_1', status: 'draft' } as unknown as Stripe.Invoice;
      }),
      finalizeInvoice: vi.fn(async (id: string) => {
        finalized.push(id);
        return {
          id,
          number: 'INV-ENT-1',
          status: 'open',
          collection_method: 'send_invoice',
          amount_due: 1_000,
          amount_paid: 0,
          currency: 'usd',
          custom_fields: null,
          period_start: 1_767_225_600,
          period_end: 1_769_904_000,
          due_date: null,
          status_transitions: { paid_at: null, voided_at: null, finalized_at: 1_767_225_600 },
          hosted_invoice_url: null,
          invoice_pdf: null,
          parent: { subscription_details: { subscription: 'sub_ent_issue' } },
        } as unknown as Stripe.Invoice;
      }),
    },
    invoiceItems: {
      create: vi.fn(async (params: Stripe.InvoiceItemCreateParams) => {
        items.push(params);
        return { id: `ii_${items.length}` } as unknown as Stripe.InvoiceItem;
      }),
    },
    customers: { retrieve: vi.fn(async () => ({ id: CUSTOMER_ID, tax_exempt: 'none' })) },
  } as unknown as Stripe & {
    invoiceItems: { create: ReturnType<typeof vi.fn> };
  };
  return { stripe, created, items, finalized };
}

const PERIOD = { start: 1_767_225_600, end: 1_769_904_000 };

const LINES = [
  {
    description: 'Committed seats',
    amountCents: 1_050_000,
    quantity: 250,
    periodStart: PERIOD.start,
    periodEnd: PERIOD.end,
  },
];

function upsertParams(calls: Call[]): unknown[] {
  const upsert = calls.find((call) =>
    call.sql.includes('insert into public.organization_billing_contracts'),
  );
  expect(upsert).toBeDefined();
  return upsert!.params;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env['STRIPE_PRODUCT_ENTERPRISE'] = ENTERPRISE_PRODUCT_ID;
});

describe('the terms written onto a contract row come from an agreement that is still in force', () => {
  const NEGOTIATED_COLUMNS = { cadence: 8, seats: 9, termStart: 6, termEnd: 7, supportTier: 14 };

  it('prefers the signed terms while the agreement is in force', async () => {
    const { db, calls } = contractDb(
      agreementRow({ contractTermStart: '2020-01-01', contractTermEnd: '2099-12-31' }),
    );

    await syncEnterpriseContractFromSubscription(db, fakeStripe().stripe, subscriptionFixture());

    const params = upsertParams(calls);
    expect(params[NEGOTIATED_COLUMNS.cadence]).toBe('quarterly');
    expect(params[NEGOTIATED_COLUMNS.seats]).toBe(250);
    expect(params[NEGOTIATED_COLUMNS.termEnd]).toBe('2099-12-31');
    expect(params[NEGOTIATED_COLUMNS.supportTier]).toBe('platinum');
  });

  it('refuses the terms of an agreement whose term and grace have run out', async () => {
    const { db, calls } = contractDb(
      agreementRow({ contractTermStart: '2023-01-01', contractTermEnd: '2024-01-01' }),
    );

    await syncEnterpriseContractFromSubscription(db, fakeStripe().stripe, subscriptionFixture());

    const params = upsertParams(calls);
    expect(params[NEGOTIATED_COLUMNS.seats]).toBe(11);
    expect(params[NEGOTIATED_COLUMNS.cadence]).toBe('annual');
    expect(params[NEGOTIATED_COLUMNS.termEnd]).not.toBe('2024-01-01');
    expect(params[NEGOTIATED_COLUMNS.supportTier]).toBeNull();
  });

  it('refuses the terms of a terminated agreement', async () => {
    const { db, calls } = contractDb(
      agreementRow({
        contractTermStart: '2020-01-01',
        contractTermEnd: '2099-12-31',
        terminatedAt: '2026-06-01T00:00:00.000Z',
      }),
    );

    await syncEnterpriseContractFromSubscription(db, fakeStripe().stripe, subscriptionFixture());

    const params = upsertParams(calls);
    expect(params[NEGOTIATED_COLUMNS.seats]).toBe(11);
    expect(params[NEGOTIATED_COLUMNS.termEnd]).not.toBe('2099-12-31');
  });

  it('refuses the terms of an agreement whose term has not started', async () => {
    const { db, calls } = contractDb(
      agreementRow({ contractTermStart: '2099-01-01', contractTermEnd: '2099-12-31' }),
    );

    await syncEnterpriseContractFromSubscription(db, fakeStripe().stripe, subscriptionFixture());

    expect(upsertParams(calls)[NEGOTIATED_COLUMNS.seats]).toBe(11);
  });

  it('keeps grace-period terms, because the agreement still grants inside its grace', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { db, calls } = contractDb(
      agreementRow({
        contractTermStart: '2020-01-01',
        contractTermEnd: yesterday,
        expiryGraceDays: 30,
      }),
    );

    await syncEnterpriseContractFromSubscription(db, fakeStripe().stripe, subscriptionFixture());

    expect(upsertParams(calls)[NEGOTIATED_COLUMNS.seats]).toBe(250);
  });

  it('still records which agreement the workspace last executed, and audits the ending', async () => {
    const { db, calls } = contractDb(
      agreementRow({ contractTermStart: '2023-01-01', contractTermEnd: '2024-01-01' }),
    );

    await syncEnterpriseContractFromSubscription(db, fakeStripe().stripe, subscriptionFixture());

    const params = upsertParams(calls);
    expect(params[24]).toBe(AGREEMENT_ID);
    expect(params[25]).toBe(3);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          reason: 'enterprise_billing_outside_contract_term',
          status: 'expired',
        }),
      }),
    );
  });
});

describe('an enterprise invoice is issued only when the signed agreement permits it', () => {
  it('issues on the contract currency, NET term, purchase order and permitted rails', async () => {
    const { db } = contractDb(
      agreementRow({ contractTermStart: '2020-01-01', contractTermEnd: '2099-12-31' }),
    );
    const { stripe, created, items, finalized } = fakeStripe();

    const invoice = await issueEnterpriseInvoice(db, stripe, {
      organizationId: ORGANIZATION_ID,
      lines: LINES,
    });

    expect(created).toHaveLength(1);
    const params = created[0]!;
    expect(params.customer).toBe(CUSTOMER_ID);
    expect(params.currency).toBe('usd');
    expect(params.collection_method).toBe('send_invoice');
    expect(params.days_until_due).toBe(45);
    expect(params.custom_fields).toEqual([{ name: 'Purchase Order', value: 'PO-SIGNED-7' }]);
    expect(params.payment_settings?.payment_method_types).toEqual([
      'ach_credit_transfer',
      'ach_debit',
      'us_bank_account',
      'customer_balance',
    ]);
    expect(params.metadata).toMatchObject({
      invoice_recipient_emails: 'ap@example.com',
      commercial_agreement_version: '3',
      po_number: 'PO-SIGNED-7',
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.amount).toBe(1_050_000);
    expect(items[0]?.description).toContain('(x250)');
    expect(items[0]?.invoice).toBe('in_issued_1');
    expect(finalized).toEqual(['in_issued_1']);
    expect(invoice.status).toBe('open');
  });

  it('carries the agreement NET term rather than a fixed due date', async () => {
    const { db } = contractDb(
      agreementRow({
        contractTermStart: '2020-01-01',
        contractTermEnd: '2099-12-31',
        paymentTermsDays: 0,
      }),
    );
    const { stripe, created } = fakeStripe();

    await issueEnterpriseInvoice(db, stripe, { organizationId: ORGANIZATION_ID, lines: LINES });

    expect(created[0]?.days_until_due).toBe(0);
  });

  it('issues nothing when the agreement requires a purchase order it does not carry', async () => {
    const { db } = contractDb(
      agreementRow({
        contractTermStart: '2020-01-01',
        contractTermEnd: '2099-12-31',
        purchaseOrderRequired: true,
        procurementReference: null,
      }),
    );
    const { stripe, created, items } = fakeStripe();

    await expect(
      issueEnterpriseInvoice(db, stripe, { organizationId: ORGANIZATION_ID, lines: LINES }),
    ).rejects.toMatchObject({ message: expect.stringContaining('cannot be issued') });

    expect(created).toHaveLength(0);
    expect(items).toHaveLength(0);
    expect(stripe.invoices.create).not.toHaveBeenCalled();
  });

  it('issues nothing when the Order Form names no invoice recipient', async () => {
    const { db } = contractDb(
      agreementRow({
        contractTermStart: '2020-01-01',
        contractTermEnd: '2099-12-31',
        invoiceRecipientEmails: [],
      }),
    );
    const { stripe, created } = fakeStripe();

    await expect(
      issueEnterpriseInvoice(db, stripe, { organizationId: ORGANIZATION_ID, lines: LINES }),
    ).rejects.toThrow();
    expect(created).toHaveLength(0);
  });

  it('issues nothing when no seat rate was negotiated', async () => {
    const { db } = contractDb(
      agreementRow({
        contractTermStart: '2020-01-01',
        contractTermEnd: '2099-12-31',
        seatUnitPriceCents: null,
      }),
    );
    const { stripe, created } = fakeStripe();

    await expect(
      issueEnterpriseInvoice(db, stripe, { organizationId: ORGANIZATION_ID, lines: LINES }),
    ).rejects.toThrow();
    expect(created).toHaveLength(0);
  });

  it('issues nothing on an invoice rail a card-only agreement excludes', async () => {
    const { db } = contractDb(
      agreementRow({
        contractTermStart: '2020-01-01',
        contractTermEnd: '2099-12-31',
        paymentMethodPolicy: 'card_only',
      }),
    );
    const { stripe, created } = fakeStripe();

    await expect(
      issueEnterpriseInvoice(db, stripe, { organizationId: ORGANIZATION_ID, lines: LINES }),
    ).rejects.toThrow();
    expect(created).toHaveLength(0);
  });

  it('charges the card a card-only agreement does permit', async () => {
    const { db } = contractDb(
      agreementRow({
        contractTermStart: '2020-01-01',
        contractTermEnd: '2099-12-31',
        paymentMethodPolicy: 'card_only',
      }),
    );
    const { stripe, created } = fakeStripe();

    await issueEnterpriseInvoice(db, stripe, {
      organizationId: ORGANIZATION_ID,
      lines: LINES,
      collectionMethod: 'charge_automatically',
    });

    expect(created[0]?.collection_method).toBe('charge_automatically');
    expect(created[0]?.days_until_due).toBeUndefined();
    expect(created[0]?.payment_settings?.payment_method_types).toEqual(['card']);
  });

  it('issues nothing for an agreement whose term has ended', async () => {
    const { db } = contractDb(
      agreementRow({ contractTermStart: '2023-01-01', contractTermEnd: '2024-01-01' }),
    );
    const { stripe, created } = fakeStripe();

    await expect(
      issueEnterpriseInvoice(db, stripe, { organizationId: ORGANIZATION_ID, lines: LINES }),
    ).rejects.toThrow();
    expect(created).toHaveLength(0);
  });

  it('issues nothing for a terminated agreement', async () => {
    const { db } = contractDb(
      agreementRow({
        contractTermStart: '2020-01-01',
        contractTermEnd: '2099-12-31',
        terminatedAt: '2026-06-01T00:00:00.000Z',
      }),
    );
    const { stripe, created } = fakeStripe();

    await expect(
      issueEnterpriseInvoice(db, stripe, { organizationId: ORGANIZATION_ID, lines: LINES }),
    ).rejects.toThrow();
    expect(created).toHaveLength(0);
  });

  it('issues nothing when the workspace has no signed order form at all', async () => {
    const { db } = contractDb(null);
    const { stripe, created } = fakeStripe();

    await expect(
      issueEnterpriseInvoice(db, stripe, { organizationId: ORGANIZATION_ID, lines: LINES }),
    ).rejects.toThrow();
    expect(created).toHaveLength(0);
  });

  it('issues nothing with no lines, so a blank document never reaches the customer', async () => {
    const { db } = contractDb(
      agreementRow({ contractTermStart: '2020-01-01', contractTermEnd: '2099-12-31' }),
    );
    const { stripe, created } = fakeStripe();

    await expect(
      issueEnterpriseInvoice(db, stripe, { organizationId: ORGANIZATION_ID, lines: [] }),
    ).rejects.toThrow();
    expect(created).toHaveLength(0);
  });

  it('refuses a fractional amount rather than rounding it onto the document', async () => {
    const { db } = contractDb(
      agreementRow({ contractTermStart: '2020-01-01', contractTermEnd: '2099-12-31' }),
    );
    const { stripe, created } = fakeStripe();

    await expect(
      issueEnterpriseInvoice(db, stripe, {
        organizationId: ORGANIZATION_ID,
        lines: [{ ...LINES[0]!, amountCents: 4_200.5 }],
      }),
    ).rejects.toThrow();
    expect(created).toHaveLength(0);
  });
});

describe('a billing run reaches the customer as the lines the ledger produced', () => {
  const RUN_PERIOD = { start: '2026-04-01T00:00:00.000Z', end: '2026-07-01T00:00:00.000Z' };

  it('issues seats at the negotiated rate and late usage as its own line', async () => {
    const { db } = contractDb(
      agreementRow({ contractTermStart: '2020-01-01', contractTermEnd: '2099-12-31' }),
    );
    const { stripe, items } = fakeStripe();
    const run = buildEnterpriseInvoiceRun({
      contract: commercialContractView({
        identity: {
          organizationId: ORGANIZATION_ID,
          version: 3,
          state: 'executed',
          changeKind: 'initial',
          orderFormReference: 'OF-2026-001',
          signedAt: '2026-01-02T00:00:00.000Z',
          supersedesVersion: null,
        },
        window: { termStart: '2020-01-01', termEnd: '2099-12-31', expiryGraceDays: 0 },
        commercials: {
          committedSeats: 250,
          seatUnitPriceCents: 4_200,
          includedUsageCentsPerPeriod: 0,
          committedUsageBlockCents: 0,
          minimumAnnualSpendCents: 0,
          meteredUsage: true,
          billingCurrency: 'usd',
        },
        procurement: {
          paymentTermDays: 45,
          purchaseOrderRequired: false,
          purchaseOrderNumber: 'PO-SIGNED-7',
          invoiceRecipientEmails: ['ap@example.com'],
          permittedPaymentMethods: ['send_invoice'],
        },
        asOfDate: '2026-07-01',
      }),
      period: RUN_PERIOD,
      seats: {
        committedSeats: 250,
        assignedSeats: 250,
        seatUnitPriceCents: 4_200,
        daysRemainingInTerm: 180,
        daysInTerm: 365,
      },
      usage: [
        {
          sourceRef: 'late-1',
          occurredAt: '2026-02-01T00:00:00.000Z',
          settledAt: '2026-05-01T00:00:00.000Z',
          amountCents: 3_300,
        },
      ],
      prepaidBalanceCents: 0,
      recognizedTermSpendCents: 0,
      isFinalPeriodOfTerm: false,
      settlementCutOff: '2026-07-02T00:00:00.000Z',
    });

    await issueEnterpriseInvoiceForRun(db, stripe, {
      organizationId: ORGANIZATION_ID,
      run,
      period: RUN_PERIOD,
    });

    expect(items).toHaveLength(2);
    expect(items[0]?.amount).toBe(250 * 4_200);
    expect(items[0]?.description).toContain('(x250)');
    expect(items[1]?.amount).toBe(3_300);
    expect(items[1]?.description).toContain('earlier period');
    for (const item of items) {
      expect(item.period).toEqual({
        start: Math.floor(Date.parse(RUN_PERIOD.start) / 1_000),
        end: Math.floor(Date.parse(RUN_PERIOD.end) / 1_000),
      });
    }
  });
});

describe('an invoice that arrived from outside the issuer is checked against every term', () => {
  function invoiceDb(agreement: Record<string, unknown> | null) {
    return makeDb((sql) => {
      if (sql.includes('insert into public.organization_billing_invoices')) {
        return [{ stripe_invoice_id: 'in_outside_1' }];
      }
      if (
        sql.includes('from public.organization_billing_contracts') &&
        sql.includes('stripe_subscription_id')
      ) {
        return [{ organization_id: ORGANIZATION_ID, payment_terms_days: 45 }];
      }
      if (sql.includes('from public.organization_commercial_agreements')) {
        return agreement ? [agreement] : [];
      }
      if (sql.includes('select collection_stage')) return [{ collection_stage: 'current' }];
      return [];
    });
  }

  function outsideInvoice(overrides: Partial<Stripe.Invoice> = {}): Stripe.Invoice {
    return {
      id: 'in_outside_1',
      number: 'INV-OUT-1',
      status: 'open',
      collection_method: 'send_invoice',
      amount_due: 900_000,
      amount_paid: 0,
      currency: 'usd',
      custom_fields: null,
      period_start: PERIOD.start,
      period_end: PERIOD.end,
      due_date: null,
      status_transitions: { paid_at: null, voided_at: null, finalized_at: PERIOD.start },
      hosted_invoice_url: null,
      invoice_pdf: null,
      payment_settings: { payment_method_types: ['ach_credit_transfer'] },
      parent: { subscription_details: { subscription: 'sub_ent_issue' } },
      ...overrides,
    } as unknown as Stripe.Invoice;
  }

  it('names a missing purchase order, not only a forbidden payment rail', async () => {
    const { db } = invoiceDb(
      agreementRow({
        contractTermStart: '2020-01-01',
        contractTermEnd: '2099-12-31',
        purchaseOrderRequired: true,
        procurementReference: null,
      }),
    );

    await recordEnterpriseInvoiceEvent(db, outsideInvoice());

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          reason: 'enterprise_invoice_not_issuable_under_agreement',
          changedKeys: ['purchase_order_required'],
        }),
      }),
    );
  });

  it('names an invoice denominated in a currency the contract never agreed to', async () => {
    const { db } = invoiceDb(
      agreementRow({ contractTermStart: '2020-01-01', contractTermEnd: '2099-12-31' }),
    );

    await recordEnterpriseInvoiceEvent(db, outsideInvoice({ currency: 'eur' }));

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ changedKeys: ['currency_not_contracted'] }),
      }),
    );
  });

  it('names an invoice raised after the agreement ended', async () => {
    const { db } = invoiceDb(
      agreementRow({ contractTermStart: '2023-01-01', contractTermEnd: '2024-01-01' }),
    );

    await recordEnterpriseInvoiceEvent(db, outsideInvoice());

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ changedKeys: ['contract_not_in_force'] }),
      }),
    );
  });

  it('says nothing about an invoice the agreement would have issued itself', async () => {
    const { db } = invoiceDb(
      agreementRow({ contractTermStart: '2020-01-01', contractTermEnd: '2099-12-31' }),
    );

    await recordEnterpriseInvoiceEvent(db, outsideInvoice());

    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});
