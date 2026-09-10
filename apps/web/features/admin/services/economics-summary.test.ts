import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  APPLE_COMMISSION_RATE,
  ECONOMICS_GROUPINGS,
  GOOGLE_PLAY_COMMISSION_RATE,
  readEconomicsSummary,
  type EconomicsGrouping,
} from './economics-summary';

const FROM = new Date('2026-08-01T00:00:00.000Z');
const TO = new Date('2026-08-31T00:00:00.000Z');

interface Fixtures {
  cost?: Record<string, unknown>[];
  subscriptions?: Record<string, unknown>[];
  topUps?: Record<string, unknown>[];
  fees?: Record<string, unknown>[];
  reconciliation?: Record<string, unknown>[] | Error;
}

function costRow(over: Record<string, unknown> = {}) {
  return {
    group_key: 'total',
    events: '3',
    legacy_rows: '1',
    canonical_microusd: '1500000',
    estimated_microusd: '400000',
    reported_microusd: '100000',
    model_microusd: '300000',
    search_microusd: '100000',
    sandbox_microusd: '50000',
    voice_microusd: '25000',
    media_microusd: '25000',
    rows_estimated: '2',
    rows_provider_reported: '1',
    rows_reconciled: '0',
    ...over,
  };
}

function harness(fixtures: Fixtures = {}) {
  const seen: string[] = [];
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    const text = String(sql);
    seen.push(text);
    if (text.includes('provider_cost_reconciliation_days')) {
      if (fixtures.reconciliation instanceof Error) throw fixtures.reconciliation;
      return fixtures.reconciliation ?? [];
    }
    if (text.includes('with priced as')) return fixtures.cost ?? [];
    if (text.includes('credit_transactions')) return fixtures.topUps ?? [];
    if (text.includes('cogs_adjustments')) return fixtures.fees ?? [];
    if (text.includes('from public.subscriptions')) return fixtures.subscriptions ?? [];
    return [];
  });
  return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, query, seen };
}

beforeEach(() => vi.clearAllMocks());

describe('readEconomicsSummary', () => {
  it('splits provider COGS into estimated and reported and counts reconciliation status', async () => {
    const { db } = harness({ cost: [costRow()] });

    const summary = await readEconomicsSummary({ from: FROM, to: TO, groupBy: 'total', db });

    expect(summary.totals.cogs.estimatedMicrousd).toBe(400_000);
    expect(summary.totals.cogs.reportedMicrousd).toBe(100_000);
    expect(summary.totals.cogs.totalMicrousd).toBe(500_000);
    expect(summary.totals.cogs.byClassMicrousd).toEqual({
      model: 300_000,
      search: 100_000,
      sandbox: 50_000,
      voice: 25_000,
      media: 25_000,
    });
    expect(summary.totals.cogs.rowsByStatus).toEqual({
      estimated: 2,
      provider_reported: 1,
      reconciled: 0,
    });
  });

  it('reports canonical value in credits and its ratio to COGS, never billed_cents', async () => {
    const { db } = harness({ cost: [costRow()] });

    const summary = await readEconomicsSummary({ from: FROM, to: TO, groupBy: 'total', db });

    expect(summary.totals.canonicalValueMicrousd).toBe(1_500_000);
    expect(summary.totals.canonicalValueCredits).toBe(75);
    expect(summary.totals.canonicalValueToCogsRatio).toBe(3);
    expect(summary.totals.legacyRows).toBe(1);
  });

  it('derives subscription revenue from the plan price and says so', async () => {
    const { db } = harness({
      cost: [costRow()],
      subscriptions: [
        {
          plan_tier: 'pro',
          subscriptions: '2',
          apple_subscriptions: '1',
          google_subscriptions: '0',
        },
      ],
      topUps: [{ plan_tier: 'pro', amount_cents: '1000', apple_cents: '0', google_cents: '0' }],
      fees: [{ amount_cents: '200' }],
    });

    const summary = await readEconomicsSummary({ from: FROM, to: TO, groupBy: 'total', db });
    const revenue = summary.totals.revenue;

    expect(summary.subscriptionRevenueBasis).toBe('derived_from_plan_price');
    expect(revenue?.subscriptionMicrousd).toBe(40_000_000);
    expect(revenue?.topUpMicrousd).toBe(10_000_000);
    expect(revenue?.cashMicrousd).toBe(50_000_000);
    expect(summary.totals.paymentFeesMicrousd).toBe(2_000_000);
  });

  it('estimates the Apple commission from the store-billed subscriptions', async () => {
    const { db } = harness({
      cost: [costRow()],
      subscriptions: [
        {
          plan_tier: 'pro',
          subscriptions: '2',
          apple_subscriptions: '1',
          google_subscriptions: '1',
        },
      ],
    });

    const summary = await readEconomicsSummary({ from: FROM, to: TO, groupBy: 'total', db });

    expect(summary.totals.storeCommission.appleMicrousd).toBe(20_000_000 * APPLE_COMMISSION_RATE);
    expect(summary.totals.storeCommission.googleMicrousd).toBe(
      20_000_000 * GOOGLE_PLAY_COMMISSION_RATE,
    );
    expect(summary.totals.storeCommission.estimate).toBe(true);
  });

  it('takes every cost and fee off cash revenue to get contribution', async () => {
    const { db } = harness({
      cost: [costRow()],
      subscriptions: [
        {
          plan_tier: 'pro',
          subscriptions: '2',
          apple_subscriptions: '1',
          google_subscriptions: '0',
        },
      ],
      topUps: [{ plan_tier: 'pro', amount_cents: '1000', apple_cents: '0', google_cents: '0' }],
      fees: [{ amount_cents: '200' }],
    });

    const summary = await readEconomicsSummary({ from: FROM, to: TO, groupBy: 'total', db });

    expect(summary.totals.contributionMicrousd).toBe(41_500_000);
    expect(summary.totals.contributionMargin).toBeCloseTo(0.83, 4);
  });

  it('counts an enterprise subscription without pricing it', async () => {
    const { db } = harness({
      subscriptions: [
        {
          plan_tier: 'enterprise',
          subscriptions: '3',
          apple_subscriptions: '0',
          google_subscriptions: '0',
        },
      ],
    });

    const summary = await readEconomicsSummary({ from: FROM, to: TO, groupBy: 'total', db });

    expect(summary.totals.revenue?.subscriptions).toBe(3);
    expect(summary.totals.revenue?.unpricedSubscriptions).toBe(3);
    expect(summary.totals.revenue?.subscriptionMicrousd).toBe(0);
  });

  it('leaves revenue unattributed on a grouping that cannot carry it', async () => {
    const { db } = harness({
      cost: [costRow({ group_key: 'openai' })],
      subscriptions: [
        {
          plan_tier: 'pro',
          subscriptions: '1',
          apple_subscriptions: '0',
          google_subscriptions: '0',
        },
      ],
    });

    const summary = await readEconomicsSummary({ from: FROM, to: TO, groupBy: 'provider', db });

    expect(summary.groups[0]?.key).toBe('openai');
    expect(summary.groups[0]?.revenue).toBeNull();
    expect(summary.groups[0]?.contributionMicrousd).toBeNull();
    expect(summary.totals.revenue?.subscriptionMicrousd).toBe(20_000_000);
  });

  it('attributes revenue to each plan when the breakdown is by plan', async () => {
    const { db } = harness({
      cost: [costRow({ group_key: 'pro' }), costRow({ group_key: 'max' })],
      subscriptions: [
        {
          plan_tier: 'pro',
          subscriptions: '1',
          apple_subscriptions: '0',
          google_subscriptions: '0',
        },
        {
          plan_tier: 'max',
          subscriptions: '1',
          apple_subscriptions: '0',
          google_subscriptions: '0',
        },
      ],
    });

    const summary = await readEconomicsSummary({ from: FROM, to: TO, groupBy: 'plan', db });
    const byKey = new Map(summary.groups.map((group) => [group.key, group]));

    expect(byKey.get('pro')?.revenue?.subscriptionMicrousd).toBe(20_000_000);
    expect(byKey.get('max')?.revenue?.subscriptionMicrousd).toBe(100_000_000);
  });

  const GROUP_EXPRESSION_MARKER: Record<EconomicsGrouping, string> = {
    total: "'total' as group_key",
    plan: 's.plan_tier',
    model: 'e.model',
    provider: 'e.provider as group_key',
    route: 'e.route_id',
    feature: 'e.feature, e.capability',
    surface: 'e.surface',
  };

  it.each(ECONOMICS_GROUPINGS)('groups the ledger by %s', async (groupBy) => {
    const { db, seen } = harness({ cost: [costRow()] });

    await readEconomicsSummary({ from: FROM, to: TO, groupBy, db });

    const costSql = seen.find((sql) => sql.includes('with priced as'));
    expect(costSql).toContain(GROUP_EXPRESSION_MARKER[groupBy]);
  });

  it('reports the gap between a provider figure and the ledger', async () => {
    const { db } = harness({
      cost: [costRow()],
      reconciliation: [
        {
          provider: 'openai',
          day: '2026-08-30',
          source: 'openai_costs_api',
          reported_microusd: '900000',
          ledger_microusd: '500000',
        },
      ],
    });

    const summary = await readEconomicsSummary({ from: FROM, to: TO, groupBy: 'total', db });

    expect(summary.reconciliation.available).toBe(true);
    expect(summary.reconciliation.gaps[0]?.gapMicrousd).toBe(400_000);
  });

  it('answers without gaps when the reconciliation table is absent', async () => {
    const { db } = harness({
      cost: [costRow()],
      reconciliation: new Error('relation "provider_cost_reconciliation_days" does not exist'),
    });

    const summary = await readEconomicsSummary({ from: FROM, to: TO, groupBy: 'total', db });

    expect(summary.reconciliation).toEqual({ available: false, gaps: [] });
    expect(summary.totals.cogs.totalMicrousd).toBe(500_000);
  });

  it('binds the period to every query rather than interpolating it', async () => {
    const { db, query } = harness({ cost: [costRow()] });

    await readEconomicsSummary({ from: FROM, to: TO, groupBy: 'total', db });

    for (const call of query.mock.calls) {
      expect(call[1]?.[0]).toBe(FROM.toISOString());
      expect(call[1]?.[1]).toBe(TO.toISOString());
    }
  });
});
