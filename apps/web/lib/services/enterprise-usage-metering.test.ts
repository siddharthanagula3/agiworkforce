import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const getOrganizationMonthToDateSpendCents = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  getOrganizationMonthToDateSpendCents: (...args: unknown[]) =>
    getOrganizationMonthToDateSpendCents(...args),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  computeEnterpriseUsageAllowance,
  computeNewOverageToReportCents,
  reportEnterpriseOverageUsage,
  resolveEnterpriseUsagePeriod,
} from './enterprise-usage-metering';

const FEBRUARY = new Date('2026-02-15T12:00:00.000Z');
const MARCH = new Date('2026-03-02T00:00:00.000Z');

function fakeDb(rows: unknown[] | ((sql: string, params: unknown[]) => unknown)): DatabaseAdapter {
  const query = vi.fn(async (sql: string, params: unknown[] = []) =>
    typeof rows === 'function' ? rows(sql, params) : rows,
  );
  return {
    query,
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter;
}

interface FakeStripe {
  prices: { retrieve: ReturnType<typeof vi.fn> };
  billing: {
    meters: { retrieve: ReturnType<typeof vi.fn> };
    meterEvents: { create: ReturnType<typeof vi.fn> };
  };
}

function fakeStripe(overrides: Partial<FakeStripe> = {}): Stripe {
  return {
    prices: {
      retrieve: vi.fn().mockResolvedValue({ recurring: { meter: 'mtr_overage' } }),
    },
    billing: {
      meters: {
        retrieve: vi.fn().mockResolvedValue({ event_name: 'enterprise_overage' }),
      },
      meterEvents: {
        create: vi.fn().mockResolvedValue({ identifier: 'evt_1' }),
      },
    },
    ...overrides,
  } as unknown as Stripe;
}

describe('resolveEnterpriseUsagePeriod', () => {
  it('keys the period to the calendar month in UTC', () => {
    expect(resolveEnterpriseUsagePeriod(FEBRUARY)).toEqual({
      key: '2026-02',
      start: '2026-02-01T00:00:00.000Z',
      end: '2026-03-01T00:00:00.000Z',
    });
  });
});

describe('computeEnterpriseUsageAllowance', () => {
  const period = resolveEnterpriseUsagePeriod(FEBRUARY);

  it('sums the included allowance and the committed usage block', () => {
    const allowance = computeEnterpriseUsageAllowance({
      organizationId: 'org_1',
      period,
      includedUsageCentsPerPeriod: 500_000,
      committedUsageBlockCents: 100_000,
      consumedCents: 550_000,
    });

    expect(allowance.allowanceCents).toBe(600_000);
    expect(allowance.overageCents).toBe(0);
  });

  it('reports overage only past the combined allowance', () => {
    const allowance = computeEnterpriseUsageAllowance({
      organizationId: 'org_1',
      period,
      includedUsageCentsPerPeriod: 500_000,
      committedUsageBlockCents: 100_000,
      consumedCents: 650_000,
    });

    expect(allowance.overageCents).toBe(50_000);
  });

  it('never reports negative overage or negative consumption', () => {
    const allowance = computeEnterpriseUsageAllowance({
      organizationId: 'org_1',
      period,
      includedUsageCentsPerPeriod: 500_000,
      committedUsageBlockCents: 0,
      consumedCents: -10,
    });

    expect(allowance.consumedCents).toBe(0);
    expect(allowance.overageCents).toBe(0);
  });
});

describe('computeNewOverageToReportCents', () => {
  const period = resolveEnterpriseUsagePeriod(FEBRUARY);

  it('reports the full overage when nothing was reported before', () => {
    expect(
      computeNewOverageToReportCents({ period, overageCents: 3_000, previouslyReported: null }),
    ).toBe(3_000);
  });

  it('reports only the delta since the last reported cumulative overage', () => {
    expect(
      computeNewOverageToReportCents({
        period,
        overageCents: 3_000,
        previouslyReported: { period: period.key, cumulativeOverageReportedCents: 1_200 },
      }),
    ).toBe(1_800);
  });

  it('never reports a negative delta when overage has not grown', () => {
    expect(
      computeNewOverageToReportCents({
        period,
        overageCents: 1_000,
        previouslyReported: { period: period.key, cumulativeOverageReportedCents: 1_200 },
      }),
    ).toBe(0);
  });

  it('resets the baseline to zero across a period boundary', () => {
    const marchPeriod = resolveEnterpriseUsagePeriod(MARCH);

    expect(
      computeNewOverageToReportCents({
        period: marchPeriod,
        overageCents: 500,
        previouslyReported: { period: '2026-02', cumulativeOverageReportedCents: 9_000 },
      }),
    ).toBe(500);
  });
});

describe('reportEnterpriseOverageUsage', () => {
  it('skips a contract with no overage price and never calls stripe', async () => {
    const db = fakeDb([
      {
        organization_id: 'org_1',
        stripe_customer_id: 'cus_1',
        included_usage_cents_per_period: 10_000,
        committed_usage_block_cents: 0,
        overage_stripe_price_id: null,
        metadata: {},
      },
    ]);
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    expect(results).toEqual([
      {
        organizationId: 'org_1',
        status: 'skipped_no_overage_price',
        reportedCents: 0,
        cumulativeOverageCents: 0,
      },
    ]);
    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
    expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
  });

  it('reports the full overage as a meter event and persists the cumulative total', async () => {
    getOrganizationMonthToDateSpendCents.mockResolvedValueOnce(30_000);
    const db = fakeDb([
      {
        organization_id: 'org_1',
        stripe_customer_id: 'cus_1',
        included_usage_cents_per_period: 10_000,
        committed_usage_block_cents: 0,
        overage_stripe_price_id: 'price_overage',
        metadata: {},
      },
    ]);
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    expect(results).toEqual([
      {
        organizationId: 'org_1',
        status: 'reported',
        reportedCents: 20_000,
        cumulativeOverageCents: 20_000,
      },
    ]);
    expect(stripe.billing.meterEvents.create).toHaveBeenCalledWith({
      event_name: 'enterprise_overage',
      payload: { stripe_customer_id: 'cus_1', value: '20000' },
      identifier: 'enterprise-overage:org_1:2026-02-15',
      timestamp: Math.floor(FEBRUARY.getTime() / 1000),
    });
    expect(getOrganizationMonthToDateSpendCents).toHaveBeenCalledWith(
      'org_1',
      db,
      resolveEnterpriseUsagePeriod(FEBRUARY),
    );
    const persistCall = (db.query as ReturnType<typeof vi.fn>).mock.calls.find(([sql]) =>
      sql.includes('update public.organization_billing_contracts'),
    );
    expect(persistCall?.[1]).toEqual([
      'org_1',
      JSON.stringify({
        enterpriseUsageReporting: { period: '2026-02', cumulativeOverageReportedCents: 20_000 },
      }),
    ]);
  });

  it('is idempotent: rerunning the same day with the same ledger total reports nothing new', async () => {
    getOrganizationMonthToDateSpendCents.mockResolvedValue(30_000);
    const db = fakeDb([
      {
        organization_id: 'org_1',
        stripe_customer_id: 'cus_1',
        included_usage_cents_per_period: 10_000,
        committed_usage_block_cents: 0,
        overage_stripe_price_id: 'price_overage',
        metadata: {
          enterpriseUsageReporting: { period: '2026-02', cumulativeOverageReportedCents: 20_000 },
        },
      },
    ]);
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    expect(results).toEqual([
      {
        organizationId: 'org_1',
        status: 'skipped_no_new_overage',
        reportedCents: 0,
        cumulativeOverageCents: 20_000,
      },
    ]);
    expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
  });

  it('resets the reported baseline across a period boundary', async () => {
    getOrganizationMonthToDateSpendCents.mockResolvedValueOnce(15_000);
    const db = fakeDb([
      {
        organization_id: 'org_1',
        stripe_customer_id: 'cus_1',
        included_usage_cents_per_period: 10_000,
        committed_usage_block_cents: 0,
        overage_stripe_price_id: 'price_overage',
        metadata: {
          enterpriseUsageReporting: { period: '2026-02', cumulativeOverageReportedCents: 20_000 },
        },
      },
    ]);
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: MARCH });

    expect(results).toEqual([
      {
        organizationId: 'org_1',
        status: 'reported',
        reportedCents: 5_000,
        cumulativeOverageCents: 5_000,
      },
    ]);
  });

  it('skips a price with no attached meter and logs once', async () => {
    getOrganizationMonthToDateSpendCents.mockResolvedValueOnce(30_000);
    const db = fakeDb([
      {
        organization_id: 'org_1',
        stripe_customer_id: 'cus_1',
        included_usage_cents_per_period: 10_000,
        committed_usage_block_cents: 0,
        overage_stripe_price_id: 'price_no_meter',
        metadata: {},
      },
    ]);
    const stripe = fakeStripe({
      prices: { retrieve: vi.fn().mockResolvedValue({ recurring: { meter: null } }) },
    });

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    expect(results).toEqual([
      {
        organizationId: 'org_1',
        status: 'skipped_no_meter',
        reportedCents: 0,
        cumulativeOverageCents: 20_000,
      },
    ]);
    expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
  });

  it('records a failure and continues past a rejected stripe call for one organization', async () => {
    getOrganizationMonthToDateSpendCents
      .mockResolvedValueOnce(30_000)
      .mockResolvedValueOnce(30_000);
    const db = fakeDb([
      {
        organization_id: 'org_1',
        stripe_customer_id: 'cus_1',
        included_usage_cents_per_period: 10_000,
        committed_usage_block_cents: 0,
        overage_stripe_price_id: 'price_overage',
        metadata: {},
      },
      {
        organization_id: 'org_2',
        stripe_customer_id: 'cus_2',
        included_usage_cents_per_period: 10_000,
        committed_usage_block_cents: 0,
        overage_stripe_price_id: 'price_overage',
        metadata: {},
      },
    ]);
    const stripe = fakeStripe();
    (stripe.billing.meterEvents.create as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('stripe unavailable'))
      .mockResolvedValueOnce({ identifier: 'evt_2' });

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    expect(results[0]).toMatchObject({ organizationId: 'org_1', status: 'failed' });
    expect(results[1]).toMatchObject({ organizationId: 'org_2', status: 'reported' });
  });

  it('caches the resolved meter event name across contracts sharing one overage price', async () => {
    getOrganizationMonthToDateSpendCents
      .mockResolvedValueOnce(30_000)
      .mockResolvedValueOnce(30_000);
    const db = fakeDb([
      {
        organization_id: 'org_1',
        stripe_customer_id: 'cus_1',
        included_usage_cents_per_period: 10_000,
        committed_usage_block_cents: 0,
        overage_stripe_price_id: 'price_shared',
        metadata: {},
      },
      {
        organization_id: 'org_2',
        stripe_customer_id: 'cus_2',
        included_usage_cents_per_period: 10_000,
        committed_usage_block_cents: 0,
        overage_stripe_price_id: 'price_shared',
        metadata: {},
      },
    ]);
    const stripe = fakeStripe();

    await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    expect(stripe.prices.retrieve).toHaveBeenCalledTimes(1);
    expect(stripe.billing.meters.retrieve).toHaveBeenCalledTimes(1);
  });
});
