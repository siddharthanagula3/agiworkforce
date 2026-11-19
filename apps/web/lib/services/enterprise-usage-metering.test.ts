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
const JUNE_FIRST = new Date('2026-06-01T05:10:00.000Z');

function spendByPeriod(spend: Record<string, number>) {
  getOrganizationMonthToDateSpendCents.mockImplementation(
    async (_organizationId: string, _db: unknown, period: { key: string }) =>
      spend[period.key] ?? 0,
  );
}

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

function contractRow(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: 'org_1',
    stripe_customer_id: 'cus_1',
    included_usage_cents_per_period: 10_000,
    committed_usage_block_cents: 0,
    overage_stripe_price_id: 'price_overage',
    overage_reported_period: null,
    overage_reported_cents: 0,
    overage_pending_period: null,
    overage_pending_cents: null,
    overage_pending_cumulative_cents: null,
    overage_pending_identifier: null,
    overage_pending_at: null,
    overage_pending_customer_id: null,
    overage_pending_price_id: null,
    ...overrides,
  };
}

function queryCalls(db: DatabaseAdapter): Array<[string, unknown[]]> {
  return (db.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string, unknown[]]>;
}

function readsContracts(sql: string): 'active' | 'ended' | null {
  if (!sql.includes('from public.organization_billing_contracts')) return null;
  return sql.includes('where ended_at is not null') ? 'ended' : 'active';
}

function contractsDb(
  contracts: unknown[],
  options: { claimed?: boolean; ended?: unknown[]; closedOut?: boolean } = {},
) {
  return fakeDb((sql) => {
    const read = readsContracts(sql);
    if (read === 'active') return contracts;
    if (read === 'ended') return options.ended ?? [];
    if (sql.includes('returning organization_id')) {
      return options.claimed === false ? [] : [{ organization_id: 'claimed' }];
    }
    if (sql.includes('returning overage_closeout_at')) {
      return options.closedOut === false ? [] : [{ overage_closeout_at: 'recorded' }];
    }
    return [];
  });
}

describe('reportEnterpriseOverageUsage', () => {
  it('skips a contract with no overage price and never calls stripe', async () => {
    const db = contractsDb([contractRow({ overage_stripe_price_id: null })]);
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

  it('records the report as pending before stripe is called and confirms it after', async () => {
    spendByPeriod({ '2026-02': 30_000 });
    const order: string[] = [];
    const db = fakeDb((sql) => {
      const read = readsContracts(sql);
      if (read) return read === 'active' ? [contractRow()] : [];
      if (sql.includes('returning organization_id')) {
        order.push('claim');
        return [{ organization_id: 'org_1' }];
      }
      if (sql.includes('overage_reported_cents = overage_pending_cumulative_cents')) {
        order.push('commit');
      }
      return [];
    });
    const stripe = fakeStripe();
    (stripe.billing.meterEvents.create as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('stripe');
      return { identifier: 'evt_1' };
    });

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    expect(results).toEqual([
      {
        organizationId: 'org_1',
        status: 'reported',
        reportedCents: 20_000,
        cumulativeOverageCents: 20_000,
      },
    ]);
    expect(order).toEqual(['claim', 'stripe', 'commit']);
    expect(stripe.billing.meterEvents.create).toHaveBeenCalledWith({
      event_name: 'enterprise_overage',
      payload: { stripe_customer_id: 'cus_1', value: '20000' },
      identifier: 'enterprise-overage:org_1:2026-02:20000',
      timestamp: Math.floor(FEBRUARY.getTime() / 1000),
    });
    expect(getOrganizationMonthToDateSpendCents).toHaveBeenCalledWith(
      'org_1',
      db,
      resolveEnterpriseUsagePeriod(FEBRUARY),
    );
    const claim = queryCalls(db).find(([sql]) => sql.includes('returning organization_id'));
    expect(claim?.[1]).toEqual([
      'org_1',
      '2026-02',
      20_000,
      20_000,
      'enterprise-overage:org_1:2026-02:20000',
      FEBRUARY.toISOString(),
      null,
      0,
      'cus_1',
      'price_overage',
    ]);
    expect(claim?.[0]).toContain('overage_pending_customer_id = $9');
    expect(claim?.[0]).toContain('overage_pending_price_id = $10');
    expect(claim?.[0]).toContain('and ended_at is null');
    const commit = queryCalls(db).find(([sql]) =>
      sql.includes('overage_reported_cents = overage_pending_cumulative_cents'),
    );
    expect(commit?.[0]).toContain('overage_pending_customer_id = null');
    expect(commit?.[0]).toContain('overage_pending_price_id = null');
  });

  it('resends an unconfirmed report to the customer and meter it was claimed for', async () => {
    spendByPeriod({ '2026-02': 30_000 });
    const pendingAt = new Date('2026-02-14T05:10:00.000Z');
    const db = contractsDb([
      contractRow({
        stripe_customer_id: 'cus_replacement',
        overage_stripe_price_id: 'price_replacement',
        overage_pending_period: '2026-02',
        overage_pending_cents: 20_000,
        overage_pending_cumulative_cents: 20_000,
        overage_pending_identifier: 'enterprise-overage:org_1:2026-02:20000',
        overage_pending_at: pendingAt.toISOString(),
        overage_pending_customer_id: 'cus_1',
        overage_pending_price_id: 'price_overage',
      }),
    ]);
    const meterByPrice: Record<string, string> = {
      price_overage: 'mtr_original',
      price_replacement: 'mtr_replacement',
    };
    const eventByMeter: Record<string, string> = {
      mtr_original: 'enterprise_overage',
      mtr_replacement: 'replacement_overage',
    };
    const stripe = fakeStripe({
      prices: {
        retrieve: vi.fn(async (priceId: string) => ({
          recurring: { meter: meterByPrice[priceId] },
        })),
      },
      billing: {
        meters: {
          retrieve: vi.fn(async (meterId: string) => ({ event_name: eventByMeter[meterId] })),
        },
        meterEvents: { create: vi.fn().mockResolvedValue({ identifier: 'evt_1' }) },
      },
    });

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    expect(stripe.billing.meterEvents.create).toHaveBeenCalledTimes(1);
    expect(stripe.billing.meterEvents.create).toHaveBeenCalledWith({
      event_name: 'enterprise_overage',
      payload: { stripe_customer_id: 'cus_1', value: '20000' },
      identifier: 'enterprise-overage:org_1:2026-02:20000',
      timestamp: Math.floor(pendingAt.getTime() / 1000),
    });
    expect(stripe.prices.retrieve).toHaveBeenCalledWith('price_overage');
    expect(results[0]).toMatchObject({ status: 'reported', reportedCents: 20_000 });
  });

  it('leaves the report pending when stripe rejects it, so nothing is marked reported', async () => {
    spendByPeriod({ '2026-02': 30_000 });
    const db = contractsDb([contractRow()]);
    const stripe = fakeStripe();
    (stripe.billing.meterEvents.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('stripe unavailable'),
    );

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    expect(results[0]).toMatchObject({ organizationId: 'org_1', status: 'failed' });
    expect(
      queryCalls(db).some(([sql]) =>
        sql.includes('overage_reported_cents = overage_pending_cumulative_cents'),
      ),
    ).toBe(false);
  });

  it('resends an unconfirmed report under its original identifier before computing anything new', async () => {
    spendByPeriod({ '2026-02': 30_000 });
    const pendingAt = new Date('2026-02-14T05:10:00.000Z');
    const db = contractsDb([
      contractRow({
        overage_pending_period: '2026-02',
        overage_pending_cents: 20_000,
        overage_pending_cumulative_cents: 20_000,
        overage_pending_identifier: 'enterprise-overage:org_1:2026-02:20000',
        overage_pending_at: pendingAt.toISOString(),
      }),
    ]);
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    expect(stripe.billing.meterEvents.create).toHaveBeenCalledTimes(1);
    expect(stripe.billing.meterEvents.create).toHaveBeenCalledWith({
      event_name: 'enterprise_overage',
      payload: { stripe_customer_id: 'cus_1', value: '20000' },
      identifier: 'enterprise-overage:org_1:2026-02:20000',
      timestamp: Math.floor(pendingAt.getTime() / 1000),
    });
    expect(results).toEqual([
      {
        organizationId: 'org_1',
        status: 'reported',
        reportedCents: 20_000,
        cumulativeOverageCents: 20_000,
      },
    ]);
    expect(queryCalls(db).some(([sql]) => sql.includes('returning organization_id'))).toBe(false);
  });

  it('reports only growth past a resent report in the same run', async () => {
    spendByPeriod({ '2026-02': 35_000 });
    const db = contractsDb([
      contractRow({
        overage_pending_period: '2026-02',
        overage_pending_cents: 20_000,
        overage_pending_cumulative_cents: 20_000,
        overage_pending_identifier: 'enterprise-overage:org_1:2026-02:20000',
        overage_pending_at: '2026-02-14T05:10:00.000Z',
      }),
    ]);
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    const sent = (stripe.billing.meterEvents.create as ReturnType<typeof vi.fn>).mock.calls.map(
      ([params]) => [params.identifier, params.payload.value],
    );
    expect(sent).toEqual([
      ['enterprise-overage:org_1:2026-02:20000', '20000'],
      ['enterprise-overage:org_1:2026-02:25000', '5000'],
    ]);
    expect(results[0]).toMatchObject({ status: 'reported', reportedCents: 25_000 });
  });

  it('sends nothing when another run already holds an unconfirmed report', async () => {
    spendByPeriod({ '2026-02': 30_000 });
    const db = contractsDb([contractRow()], { claimed: false });
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    expect(results[0]).toMatchObject({ organizationId: 'org_1', status: 'failed' });
    expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
  });

  it('is idempotent: rerunning with the same ledger total reports nothing new', async () => {
    spendByPeriod({ '2026-02': 30_000 });
    const db = contractsDb([
      contractRow({ overage_reported_period: '2026-02', overage_reported_cents: 20_000 }),
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
    spendByPeriod({ '2026-03': 15_000, '2026-02': 30_000 });
    const db = contractsDb([
      contractRow({ overage_reported_period: '2026-02', overage_reported_cents: '20000' }),
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

  it('refuses to send a delta computed from a baseline another run has already advanced', async () => {
    spendByPeriod({ '2026-02': 25_000 });
    const liveRow = { period: '2026-02', cents: 10_000 };
    const db = fakeDb((sql, params) => {
      const read = readsContracts(sql);
      if (read) return read === 'active' ? [contractRow()] : [];
      if (sql.includes('returning organization_id')) {
        const matchesLive = params[6] === liveRow.period && params[7] === liveRow.cents;
        return matchesLive ? [{ organization_id: 'org_1' }] : [];
      }
      return [];
    });
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    expect(results[0]).toMatchObject({ organizationId: 'org_1', status: 'failed' });
    expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
    const claim = queryCalls(db).find(([sql]) => sql.includes('returning organization_id'));
    expect(claim?.[0]).toContain('overage_reported_period is not distinct from');
    expect(claim?.[0]).toContain('overage_reported_cents =');
  });

  it('claims against the exact reported baseline the delta was computed from', async () => {
    spendByPeriod({ '2026-02': 25_000 });
    const db = contractsDb([
      contractRow({ overage_reported_period: '2026-02', overage_reported_cents: '10000' }),
    ]);
    const stripe = fakeStripe();

    await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    const claim = queryCalls(db).find(([sql]) => sql.includes('returning organization_id'));
    expect(claim?.[1].slice(6, 8)).toEqual(['2026-02', 10_000]);
    expect(stripe.billing.meterEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { stripe_customer_id: 'cus_1', value: '5000' } }),
    );
  });

  it('settles usage that landed in the closed month after its last daily sweep', async () => {
    spendByPeriod({ '2026-05': 13_000, '2026-06': 0 });
    const db = contractsDb([
      contractRow({ overage_reported_period: '2026-05', overage_reported_cents: '1000' }),
    ]);
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: JUNE_FIRST });

    expect(stripe.billing.meterEvents.create).toHaveBeenCalledTimes(1);
    expect(stripe.billing.meterEvents.create).toHaveBeenCalledWith({
      event_name: 'enterprise_overage',
      payload: { stripe_customer_id: 'cus_1', value: '2000' },
      identifier: 'enterprise-overage:org_1:2026-05:3000',
      timestamp: Math.floor(Date.parse('2026-06-01T00:00:00.000Z') / 1000) - 1,
    });
    const claim = queryCalls(db).find(([sql]) => sql.includes('returning organization_id'));
    expect(claim?.[1]).toEqual([
      'org_1',
      '2026-05',
      2_000,
      3_000,
      'enterprise-overage:org_1:2026-05:3000',
      '2026-05-31T23:59:59.000Z',
      '2026-05',
      1_000,
      'cus_1',
      'price_overage',
    ]);
    expect(results[0]).toMatchObject({ status: 'reported', reportedCents: 2_000 });
  });

  it('reports the closed month tail and then the new month against the advanced baseline', async () => {
    spendByPeriod({ '2026-05': 13_000, '2026-06': 10_500 });
    const db = contractsDb([
      contractRow({ overage_reported_period: '2026-05', overage_reported_cents: '1000' }),
    ]);
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: JUNE_FIRST });

    const claims = queryCalls(db).filter(([sql]) => sql.includes('returning organization_id'));
    expect(claims.map(([, params]) => params.slice(1, 5).concat(params.slice(6, 8)))).toEqual([
      ['2026-05', 2_000, 3_000, 'enterprise-overage:org_1:2026-05:3000', '2026-05', 1_000],
      ['2026-06', 500, 500, 'enterprise-overage:org_1:2026-06:500', '2026-05', 3_000],
    ]);
    expect(results[0]).toMatchObject({
      status: 'reported',
      reportedCents: 2_500,
      cumulativeOverageCents: 500,
    });
  });

  it('does not rescan the closed month once the new month has been reported', async () => {
    getOrganizationMonthToDateSpendCents.mockClear();
    spendByPeriod({ '2026-06': 10_500 });
    const db = contractsDb([
      contractRow({ overage_reported_period: '2026-06', overage_reported_cents: '500' }),
    ]);
    const stripe = fakeStripe();

    await reportEnterpriseOverageUsage({ db, stripe, now: JUNE_FIRST });

    const periods = getOrganizationMonthToDateSpendCents.mock.calls.map(
      ([, , period]) => (period as { key: string }).key,
    );
    expect(periods.at(-1)).toBe('2026-06');
    expect(periods).not.toContain('2026-05');
  });

  it('skips a price with no attached meter and logs once', async () => {
    spendByPeriod({ '2026-02': 30_000 });
    const db = contractsDb([contractRow({ overage_stripe_price_id: 'price_no_meter' })]);
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
    spendByPeriod({ '2026-02': 30_000 });
    const db = contractsDb([
      contractRow(),
      contractRow({ organization_id: 'org_2', stripe_customer_id: 'cus_2' }),
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
    spendByPeriod({ '2026-02': 30_000 });
    const db = contractsDb([
      contractRow({ overage_stripe_price_id: 'price_shared' }),
      contractRow({
        organization_id: 'org_2',
        stripe_customer_id: 'cus_2',
        overage_stripe_price_id: 'price_shared',
      }),
    ]);
    const stripe = fakeStripe();

    await reportEnterpriseOverageUsage({ db, stripe, now: FEBRUARY });

    expect(stripe.prices.retrieve).toHaveBeenCalledTimes(1);
    expect(stripe.billing.meters.retrieve).toHaveBeenCalledTimes(1);
  });
});

describe('reportEnterpriseOverageUsage closeout of ended contracts', () => {
  const JUNE_FIFTEENTH = new Date('2026-06-15T05:00:00.000Z');

  function expectNoStripeTraffic(stripe: Stripe) {
    expect(stripe.prices.retrieve).not.toHaveBeenCalled();
    expect(stripe.billing.meters.retrieve).not.toHaveBeenCalled();
    expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
  }

  function closeoutCall(db: DatabaseAdapter) {
    return queryCalls(db).find(([sql]) => sql.includes('returning overage_closeout_at'));
  }

  it('reads only ended contracts whose current end has no closeout yet', async () => {
    const db = contractsDb([]);

    await reportEnterpriseOverageUsage({ db, stripe: fakeStripe(), now: JUNE_FIFTEENTH });

    const read = queryCalls(db).find(([sql]) => readsContracts(sql) === 'ended');
    expect(read?.[0]).toContain('overage_closeout_ended_at is distinct from ended_at');
  });

  it('writes off a pending report and the unswept tail up to the end, and sends nothing', async () => {
    getOrganizationMonthToDateSpendCents.mockClear();
    spendByPeriod({ '2026-06': 15_000 });
    const db = contractsDb([], {
      ended: [
        contractRow({
          ended_at: '2026-06-10T12:00:00.000Z',
          overage_reported_period: '2026-06',
          overage_reported_cents: '1000',
          overage_pending_period: '2026-06',
          overage_pending_cents: 2_000,
          overage_pending_cumulative_cents: 3_000,
          overage_pending_identifier: 'enterprise-overage:org_1:2026-06:3000',
          overage_pending_at: '2026-06-09T05:00:00.000Z',
          overage_pending_customer_id: 'cus_1',
          overage_pending_price_id: 'price_overage',
        }),
      ],
    });
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: JUNE_FIFTEENTH });

    expectNoStripeTraffic(stripe);
    expect(getOrganizationMonthToDateSpendCents).toHaveBeenCalledWith('org_1', db, {
      key: '2026-06',
      start: '2026-06-01T00:00:00.000Z',
      end: '2026-06-10T12:00:00.000Z',
    });
    expect(results).toEqual([
      {
        organizationId: 'org_1',
        status: 'closed_out',
        reportedCents: 0,
        cumulativeOverageCents: 5_000,
        closeout: {
          reason: 'contract_ended',
          writtenOffCents: 4_000,
          contractEndedAt: '2026-06-10T12:00:00.000Z',
          closedOutAt: JUNE_FIFTEENTH.toISOString(),
          unconfirmedIdentifier: 'enterprise-overage:org_1:2026-06:3000',
        },
      },
    ]);
    const closeout = closeoutCall(db);
    expect(closeout?.[1]).toEqual([
      'org_1',
      JUNE_FIFTEENTH.toISOString(),
      'contract_ended',
      4_000,
      '2026-06',
      5_000,
      'enterprise-overage:org_1:2026-06:3000',
      '2026-06',
      1_000,
    ]);
    expect(closeout?.[0]).toContain(
      'overage_written_off_unconfirmed_identifier = overage_pending_identifier',
    );
    expect(closeout?.[0]).toContain('overage_pending_identifier = null');
    expect(closeout?.[0]).toContain('overage_closeout_ended_at = ended_at');
  });

  it('includes the closed month left unswept when the contract ended just after it', async () => {
    spendByPeriod({ '2026-05': 13_000, '2026-06': 10_500 });
    const db = contractsDb([], {
      ended: [
        contractRow({
          ended_at: '2026-06-01T03:00:00.000Z',
          overage_reported_period: '2026-05',
          overage_reported_cents: '1000',
        }),
      ],
    });
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: JUNE_FIFTEENTH });

    expectNoStripeTraffic(stripe);
    expect(results[0]).toMatchObject({
      status: 'closed_out',
      cumulativeOverageCents: 500,
      closeout: { writtenOffCents: 2_500, unconfirmedIdentifier: null },
    });
    expect(closeoutCall(db)?.[1].slice(3)).toEqual([2_500, '2026-06', 500, null, '2026-05', 1_000]);
  });

  it('records a closeout of zero when nothing was left unreported', async () => {
    spendByPeriod({ '2026-06': 11_000 });
    const db = contractsDb([], {
      ended: [
        contractRow({
          ended_at: '2026-06-10T12:00:00.000Z',
          overage_reported_period: '2026-06',
          overage_reported_cents: '1000',
        }),
      ],
    });
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: JUNE_FIFTEENTH });

    expectNoStripeTraffic(stripe);
    expect(results[0]).toMatchObject({
      status: 'closed_out',
      closeout: { writtenOffCents: 0 },
    });
    expect(closeoutCall(db)?.[1].slice(3, 6)).toEqual([0, '2026-06', 1_000]);
  });

  it('writes off only the pending report for a contract that no longer has an overage price', async () => {
    getOrganizationMonthToDateSpendCents.mockClear();
    const db = contractsDb([], {
      ended: [
        contractRow({
          ended_at: '2026-06-10T12:00:00.000Z',
          overage_stripe_price_id: null,
          overage_pending_period: '2026-06',
          overage_pending_cents: 700,
          overage_pending_cumulative_cents: 700,
          overage_pending_identifier: 'enterprise-overage:org_1:2026-06:700',
          overage_pending_at: '2026-06-09T05:00:00.000Z',
        }),
      ],
    });
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: JUNE_FIFTEENTH });

    expectNoStripeTraffic(stripe);
    expect(getOrganizationMonthToDateSpendCents).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ status: 'closed_out', closeout: { writtenOffCents: 700 } });
  });

  it('fails without sending when the contract changed before the closeout was recorded', async () => {
    spendByPeriod({ '2026-06': 15_000 });
    const db = contractsDb([], {
      ended: [contractRow({ ended_at: '2026-06-10T12:00:00.000Z' })],
      closedOut: false,
    });
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: JUNE_FIFTEENTH });

    expectNoStripeTraffic(stripe);
    expect(results[0]).toMatchObject({ organizationId: 'org_1', status: 'failed' });
    expect(results[0]?.closeout).toBeUndefined();
  });

  it('reports active contracts and closes out ended ones in the same run', async () => {
    spendByPeriod({ '2026-06': 30_000 });
    const db = contractsDb([contractRow()], {
      ended: [
        contractRow({
          organization_id: 'org_2',
          stripe_customer_id: 'cus_2',
          ended_at: '2026-06-10T12:00:00.000Z',
        }),
      ],
    });
    const stripe = fakeStripe();

    const results = await reportEnterpriseOverageUsage({ db, stripe, now: JUNE_FIFTEENTH });

    expect(results.map((result) => [result.organizationId, result.status])).toEqual([
      ['org_1', 'reported'],
      ['org_2', 'closed_out'],
    ]);
    expect(stripe.billing.meterEvents.create).toHaveBeenCalledTimes(1);
    expect(stripe.billing.meterEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { stripe_customer_id: 'cus_1', value: '20000' } }),
    );
  });
});
