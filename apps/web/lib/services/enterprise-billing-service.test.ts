import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import {
  auditUnknownStripePriceIfEnterpriseConfigured,
  endEnterpriseContractIfPresent,
  recordEnterpriseInvoiceEvent,
  resolveEnterprisePlanTier,
  syncEnterpriseContractFromSubscription,
} from './enterprise-billing-service';

const ENTERPRISE_PRODUCT_ID = 'prod_enterprise_123';
const ORIGINAL_ENV = process.env['STRIPE_PRODUCT_ENTERPRISE'];

beforeEach(() => {
  vi.clearAllMocks();
  process.env['STRIPE_PRODUCT_ENTERPRISE'] = ENTERPRISE_PRODUCT_ID;
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env['STRIPE_PRODUCT_ENTERPRISE'];
  else process.env['STRIPE_PRODUCT_ENTERPRISE'] = ORIGINAL_ENV;
});

interface Call {
  sql: string;
  params: unknown[];
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

function fakeStripe(
  overrides: { pricesRetrieve?: Stripe.Price; invoicesRetrieve?: Stripe.Invoice } = {},
) {
  return {
    prices: { retrieve: vi.fn().mockResolvedValue(overrides.pricesRetrieve) },
    invoices: { retrieve: vi.fn().mockResolvedValue(overrides.invoicesRetrieve) },
  } as unknown as Stripe;
}

describe('resolveEnterprisePlanTier', () => {
  it('resolves enterprise when price.product matches the configured product', async () => {
    const price = { id: 'price_1', product: ENTERPRISE_PRODUCT_ID } as unknown as Stripe.Price;
    const tier = await resolveEnterprisePlanTier(fakeStripe(), price);
    expect(tier).toBe('enterprise');
  });

  it('resolves enterprise when the price product is an expanded object', async () => {
    const price = {
      id: 'price_1',
      product: { id: ENTERPRISE_PRODUCT_ID },
    } as unknown as Stripe.Price;
    const tier = await resolveEnterprisePlanTier(fakeStripe(), price);
    expect(tier).toBe('enterprise');
  });

  it('retrieves the price when only an id is present', async () => {
    const stripe = fakeStripe({
      pricesRetrieve: { id: 'price_1', product: ENTERPRISE_PRODUCT_ID } as unknown as Stripe.Price,
    });
    const tier = await resolveEnterprisePlanTier(stripe, 'price_1');
    expect(tier).toBe('enterprise');
    expect(stripe.prices.retrieve).toHaveBeenCalledWith('price_1');
  });

  it('returns null for a price on another product', async () => {
    const price = { id: 'price_1', product: 'prod_other' } as unknown as Stripe.Price;
    expect(await resolveEnterprisePlanTier(fakeStripe(), price)).toBeNull();
  });

  it('returns null when no enterprise product is configured', async () => {
    delete process.env['STRIPE_PRODUCT_ENTERPRISE'];
    const price = { id: 'price_1', product: ENTERPRISE_PRODUCT_ID } as unknown as Stripe.Price;
    expect(await resolveEnterprisePlanTier(fakeStripe(), price)).toBeNull();
  });

  it('returns null with no price', async () => {
    expect(await resolveEnterprisePlanTier(fakeStripe(), null)).toBeNull();
  });
});

describe('auditUnknownStripePriceIfEnterpriseConfigured', () => {
  it('is a no-op when the price is already registered elsewhere', async () => {
    const price = { id: 'price_1', product: 'prod_other' } as unknown as Stripe.Price;
    await auditUnknownStripePriceIfEnterpriseConfigured(fakeStripe(), { id: 'sub_1' }, price, true);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('is a no-op when no enterprise product is configured', async () => {
    delete process.env['STRIPE_PRODUCT_ENTERPRISE'];
    const price = { id: 'price_1', product: 'prod_other' } as unknown as Stripe.Price;
    await auditUnknownStripePriceIfEnterpriseConfigured(
      fakeStripe(),
      { id: 'sub_1' },
      price,
      false,
    );
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('is a no-op when the price is actually the enterprise price', async () => {
    const price = { id: 'price_1', product: ENTERPRISE_PRODUCT_ID } as unknown as Stripe.Price;
    await auditUnknownStripePriceIfEnterpriseConfigured(
      fakeStripe(),
      { id: 'sub_1' },
      price,
      false,
    );
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('logs and audits a genuinely unknown product/price', async () => {
    const price = { id: 'price_1', product: 'prod_mystery' } as unknown as Stripe.Price;
    await auditUnknownStripePriceIfEnterpriseConfigured(
      fakeStripe(),
      { id: 'sub_1' },
      price,
      false,
    );
    expect(loggerMocks.error).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ reason: 'unmapped_stripe_price', resourceId: 'sub_1' }),
      }),
    );
  });
});

function subscriptionFixture(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'sub_ent_1',
    customer: 'cus_ent_1',
    metadata: {},
    latest_invoice: null,
    items: {
      data: [
        {
          quantity: 42,
          price: {
            id: 'price_ent_1',
            product: ENTERPRISE_PRODUCT_ID,
            recurring: { interval: 'year', interval_count: 1 },
          },
        },
      ],
    },
    current_period_start: now,
    current_period_end: now + 365 * 24 * 60 * 60,
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe('syncEnterpriseContractFromSubscription', () => {
  it('is a no-op for a non-enterprise subscription', async () => {
    const { db, calls } = makeDb(() => []);
    const subscription = subscriptionFixture({
      items: { data: [{ quantity: 1, price: { id: 'price_pro', product: 'prod_other' } }] },
    } as unknown as Partial<Stripe.Subscription>);

    await syncEnterpriseContractFromSubscription(db, fakeStripe(), subscription);

    expect(calls).toHaveLength(0);
  });

  it('upserts the contract with seats, cadence and term dates from the subscription', async () => {
    const { db, calls } = makeDb((sql) => {
      if (sql.includes('from subscriptions')) return [{ user_id: 'user_1' }];
      if (sql.includes('from public.organizations')) return [{ id: 'org_1' }];
      return [];
    });

    await syncEnterpriseContractFromSubscription(db, fakeStripe(), subscriptionFixture());

    const upsert = calls.find((call) =>
      call.sql.includes('insert into public.organization_billing_contracts'),
    );
    expect(upsert).toBeDefined();
    expect(upsert!.params[0]).toBe('org_1');
    expect(upsert!.params[1]).toBe('cus_ent_1');
    expect(upsert!.params[2]).toBe('sub_ent_1');
    expect(upsert!.params[3]).toBe(ENTERPRISE_PRODUCT_ID);
    expect(upsert!.params[4]).toBe('price_ent_1');
    expect(upsert!.params[8]).toBe('annual');
    expect(upsert!.params[9]).toBe(42);
  });

  it('maps a monthly price with a 3-month interval count to quarterly', async () => {
    const { db, calls } = makeDb((sql) => {
      if (sql.includes('from subscriptions')) return [{ user_id: 'user_1' }];
      if (sql.includes('from public.organizations')) return [{ id: 'org_1' }];
      return [];
    });

    await syncEnterpriseContractFromSubscription(
      db,
      fakeStripe(),
      subscriptionFixture({
        items: {
          data: [
            {
              quantity: 10,
              price: {
                id: 'price_q',
                product: ENTERPRISE_PRODUCT_ID,
                recurring: { interval: 'month', interval_count: 3 },
              },
            },
          ],
        },
      } as unknown as Partial<Stripe.Subscription>),
    );

    const upsert = calls.find((call) =>
      call.sql.includes('insert into public.organization_billing_contracts'),
    );
    expect(upsert!.params[8]).toBe('quarterly');
  });

  it('reads the PO number from the invoice custom field over subscription metadata', async () => {
    const { db, calls } = makeDb((sql) => {
      if (sql.includes('from subscriptions')) return [{ user_id: 'user_1' }];
      if (sql.includes('from public.organizations')) return [{ id: 'org_1' }];
      return [];
    });

    const invoice = {
      id: 'in_1',
      custom_fields: [{ name: 'Purchase Order', value: 'PO-99' }],
    } as unknown as Stripe.Invoice;

    await syncEnterpriseContractFromSubscription(
      db,
      fakeStripe({ invoicesRetrieve: invoice }),
      subscriptionFixture({ latest_invoice: 'in_1', metadata: { po_number: 'PO-FALLBACK' } }),
    );

    const upsert = calls.find((call) =>
      call.sql.includes('insert into public.organization_billing_contracts'),
    );
    expect(upsert!.params[5]).toBe('PO-99');
  });

  it('falls back to metadata po_number when no invoice custom field matches', async () => {
    const { db, calls } = makeDb((sql) => {
      if (sql.includes('from subscriptions')) return [{ user_id: 'user_1' }];
      if (sql.includes('from public.organizations')) return [{ id: 'org_1' }];
      return [];
    });

    await syncEnterpriseContractFromSubscription(
      db,
      fakeStripe(),
      subscriptionFixture({ latest_invoice: null, metadata: { po_number: 'PO-FALLBACK' } }),
    );

    const upsert = calls.find((call) =>
      call.sql.includes('insert into public.organization_billing_contracts'),
    );
    expect(upsert!.params[5]).toBe('PO-FALLBACK');
  });

  it('skips the write when the owner has no organization yet', async () => {
    const { db, calls } = makeDb((sql) => {
      if (sql.includes('from subscriptions')) return [{ user_id: 'user_1' }];
      return [];
    });

    await syncEnterpriseContractFromSubscription(db, fakeStripe(), subscriptionFixture());

    expect(
      calls.some((call) => call.sql.includes('insert into public.organization_billing_contracts')),
    ).toBe(false);
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('writes the negotiated contract fields present in subscription metadata', async () => {
    const { db, calls } = makeDb((sql) => {
      if (sql.includes('from subscriptions')) return [{ user_id: 'user_1' }];
      if (sql.includes('from public.organizations')) return [{ id: 'org_1' }];
      return [];
    });

    await syncEnterpriseContractFromSubscription(
      db,
      fakeStripe(),
      subscriptionFixture({
        metadata: {
          included_usage_cents_per_month: '500000',
          overage_price_id: 'price_overage_1',
          committed_usage_block_cents: '250000',
          minimum_annual_spend_cents: '12000000',
          support_tier: 'platinum',
          customer_legal_entity: 'Acme Corp Ltd.',
        },
      }),
    );

    const upsert = calls.find((call) =>
      call.sql.includes('insert into public.organization_billing_contracts'),
    );
    expect(upsert!.params.slice(10)).toEqual([
      500000,
      'price_overage_1',
      250000,
      12000000,
      'platinum',
      'Acme Corp Ltd.',
    ]);
  });

  it('leaves negotiated fields untouched when metadata omits them', async () => {
    const { db, calls } = makeDb((sql) => {
      if (sql.includes('from subscriptions')) return [{ user_id: 'user_1' }];
      if (sql.includes('from public.organizations')) return [{ id: 'org_1' }];
      return [];
    });

    await syncEnterpriseContractFromSubscription(db, fakeStripe(), subscriptionFixture());

    const upsert = calls.find((call) =>
      call.sql.includes('insert into public.organization_billing_contracts'),
    );
    expect(upsert!.params.slice(10)).toEqual([null, null, null, null, null, null]);
    expect(upsert!.sql).toContain('coalesce($11::bigint, 0)');
    expect(upsert!.sql).toContain('organization_billing_contracts.included_usage_cents_per_period');
  });

  it('ignores and logs a malformed negotiated cents value rather than writing it', async () => {
    const { db, calls } = makeDb((sql) => {
      if (sql.includes('from subscriptions')) return [{ user_id: 'user_1' }];
      if (sql.includes('from public.organizations')) return [{ id: 'org_1' }];
      return [];
    });

    await syncEnterpriseContractFromSubscription(
      db,
      fakeStripe(),
      subscriptionFixture({
        metadata: { minimum_annual_spend_cents: 'not-a-number' },
      }),
    );

    const upsert = calls.find((call) =>
      call.sql.includes('insert into public.organization_billing_contracts'),
    );
    expect(upsert!.params[13]).toBeNull();
    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'minimum_annual_spend_cents', value: 'not-a-number' }),
      expect.stringContaining('Malformed enterprise contract metadata'),
    );
  });

  it('rejects a negative negotiated cents value', async () => {
    const { db, calls } = makeDb((sql) => {
      if (sql.includes('from subscriptions')) return [{ user_id: 'user_1' }];
      if (sql.includes('from public.organizations')) return [{ id: 'org_1' }];
      return [];
    });

    await syncEnterpriseContractFromSubscription(
      db,
      fakeStripe(),
      subscriptionFixture({ metadata: { committed_usage_block_cents: '-100' } }),
    );

    const upsert = calls.find((call) =>
      call.sql.includes('insert into public.organization_billing_contracts'),
    );
    expect(upsert!.params[12]).toBeNull();
  });
});

function invoiceFixture(overrides: Partial<Stripe.Invoice> = {}): Stripe.Invoice {
  return {
    id: 'in_open_1',
    number: 'INV-1',
    status: 'open',
    collection_method: 'send_invoice',
    amount_due: 500000,
    amount_paid: 0,
    currency: 'usd',
    custom_fields: null,
    period_start: 1700000000,
    period_end: 1731536000,
    due_date: 1701000000,
    status_transitions: {
      paid_at: null,
      voided_at: null,
      finalized_at: null,
      marked_uncollectible_at: null,
    },
    hosted_invoice_url: 'https://stripe.example/invoice',
    invoice_pdf: 'https://stripe.example/invoice.pdf',
    parent: { subscription_details: { subscription: 'sub_ent_1' } },
    ...overrides,
  } as unknown as Stripe.Invoice;
}

describe('recordEnterpriseInvoiceEvent', () => {
  it('is a no-op when the invoice subscription has no enterprise contract', async () => {
    const { db, calls } = makeDb(() => []);
    await recordEnterpriseInvoiceEvent(db, invoiceFixture());
    expect(
      calls.some((call) => call.sql.includes('insert into public.organization_billing_invoices')),
    ).toBe(false);
  });

  it('upserts the invoice row and recomputes the oldest open invoice', async () => {
    const { db, calls } = makeDb((sql) => {
      if (
        sql.includes('from public.organization_billing_contracts') &&
        sql.includes('stripe_subscription_id')
      ) {
        return [{ organization_id: 'org_1' }];
      }
      if (sql.includes('from public.organization_billing_invoices')) {
        return [{ stripe_invoice_id: 'in_open_1', due_at: '2023-11-26T00:00:00.000Z' }];
      }
      return [];
    });

    await recordEnterpriseInvoiceEvent(db, invoiceFixture());

    const insert = calls.find((call) =>
      call.sql.includes('insert into public.organization_billing_invoices'),
    );
    expect(insert).toBeDefined();
    expect(insert!.params[0]).toBe('in_open_1');
    expect(insert!.params[1]).toBe('org_1');
    expect(insert!.params[4]).toBe('open');

    const recompute = calls.find(
      (call) =>
        call.sql.includes('update public.organization_billing_contracts') &&
        call.sql.includes('oldest_open_invoice_id'),
    );
    expect(recompute).toBeDefined();
    expect(recompute!.params).toEqual(['org_1', 'in_open_1', '2023-11-26T00:00:00.000Z']);
  });

  it('clears the oldest open invoice when nothing is open any more', async () => {
    const { db, calls } = makeDb((sql) => {
      if (
        sql.includes('from public.organization_billing_contracts') &&
        sql.includes('stripe_subscription_id')
      ) {
        return [{ organization_id: 'org_1' }];
      }
      if (sql.includes('from public.organization_billing_invoices')) return [];
      return [];
    });

    await recordEnterpriseInvoiceEvent(db, invoiceFixture({ status: 'paid' }));

    const recompute = calls.find(
      (call) =>
        call.sql.includes('update public.organization_billing_contracts') &&
        call.sql.includes('oldest_open_invoice_id'),
    );
    expect(recompute!.params).toEqual(['org_1', null, null]);
  });
});

describe('endEnterpriseContractIfPresent', () => {
  it('sets ended_at only while it is still null', async () => {
    const { db, calls } = makeDb(() => []);
    await endEnterpriseContractIfPresent(db, 'sub_ent_1', '2026-01-01T00:00:00.000Z');

    expect(calls[0]!.sql).toContain('set ended_at = $2');
    expect(calls[0]!.sql).toContain('ended_at is null');
    expect(calls[0]!.params).toEqual(['sub_ent_1', '2026-01-01T00:00:00.000Z']);
  });
});

function coalescedParameterCasts(sql: string): Array<{ param: string; cast: string | undefined }> {
  return [...sql.matchAll(/coalesce\(\s*\$(\d+)(::\w+)?/gu)].map((match) => ({
    param: match[1]!,
    cast: match[2],
  }));
}

describe('every nullable parameter used inside coalesce carries an explicit cast', () => {
  it('casts every coalesced parameter in the contract upsert', async () => {
    const { db, calls } = makeDb((sql) => {
      if (sql.includes('from subscriptions')) return [{ user_id: 'user_1' }];
      if (sql.includes('from public.organizations')) return [{ id: 'org_1' }];
      return [];
    });

    await syncEnterpriseContractFromSubscription(db, fakeStripe(), subscriptionFixture());

    const upsert = calls.find((call) =>
      call.sql.includes('insert into public.organization_billing_contracts'),
    );
    const casts = coalescedParameterCasts(upsert!.sql);
    expect(casts.length).toBeGreaterThan(0);
    for (const { param, cast } of casts) {
      expect(cast, `$${param} is used inside coalesce(...) with no explicit cast`).toBeDefined();
    }
  });

  it('casts every coalesced parameter in the invoice upsert', async () => {
    const { db, calls } = makeDb((sql) => {
      if (
        sql.includes('from public.organization_billing_contracts') &&
        sql.includes('stripe_subscription_id')
      ) {
        return [{ organization_id: 'org_1' }];
      }
      return [];
    });

    await recordEnterpriseInvoiceEvent(db, invoiceFixture());

    const upsert = calls.find((call) =>
      call.sql.includes('insert into public.organization_billing_invoices'),
    );
    const casts = coalescedParameterCasts(upsert!.sql);
    expect(casts.length).toBeGreaterThan(0);
    for (const { param, cast } of casts) {
      expect(cast, `$${param} is used inside coalesce(...) with no explicit cast`).toBeDefined();
    }
  });

  it('has no bare, uncast $n reference immediately inside a coalesce(...) anywhere in this module', async () => {
    const { db: contractDb, calls: contractCalls } = makeDb((sql) => {
      if (sql.includes('from subscriptions')) return [{ user_id: 'user_1' }];
      if (sql.includes('from public.organizations')) return [{ id: 'org_1' }];
      return [];
    });
    await syncEnterpriseContractFromSubscription(
      contractDb,
      fakeStripe(),
      subscriptionFixture({
        metadata: {
          included_usage_cents_per_month: '1',
          overage_price_id: 'price_x',
          committed_usage_block_cents: '1',
          minimum_annual_spend_cents: '1',
          support_tier: 'x',
          customer_legal_entity: 'x',
        },
      }),
    );

    const { db: invoiceDb, calls: invoiceCalls } = makeDb((sql) => {
      if (
        sql.includes('from public.organization_billing_contracts') &&
        sql.includes('stripe_subscription_id')
      ) {
        return [{ organization_id: 'org_1' }];
      }
      if (sql.includes('from public.organization_billing_invoices')) return [];
      return [];
    });
    await recordEnterpriseInvoiceEvent(invoiceDb, invoiceFixture());

    const allSql = [...contractCalls, ...invoiceCalls].map((call) => call.sql).join('\n---\n');
    const uncast = coalescedParameterCasts(allSql).filter((entry) => !entry.cast);
    expect(uncast).toEqual([]);
  });
});
