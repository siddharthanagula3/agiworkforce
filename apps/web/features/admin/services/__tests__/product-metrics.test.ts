import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  readEconomicsSummary: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query, execute: mocks.execute }),
}));
vi.mock('@/features/admin/services/economics-summary', () => ({
  readEconomicsSummary: mocks.readEconomicsSummary,
}));

import {
  DEFAULT_PRODUCT_ANALYTICS_RETENTION_DAYS,
  PRODUCT_ANALYTICS_RETENTION_ENV,
  qualityMetrics,
  readProductMetrics,
  resolveProductAnalyticsRetentionDays,
  rollUpProductMetrics,
} from '../product-metrics';

const FROM = new Date('2026-08-18T00:00:00.000Z');
const TO = new Date('2026-09-17T00:00:00.000Z');

function economics(cashMicrousd: number, cogsMicrousd: number) {
  return {
    totals: {
      revenue: { cashMicrousd },
      cogs: { totalMicrousd: cogsMicrousd },
    },
  };
}

/**
 * Every query the service issues is answered by the statement it names, so a
 * test failure points at the measurement that moved rather than at a call
 * order that did not.
 */
function answer(rows: Record<string, unknown[]>): void {
  mocks.query.mockImplementation(async (sql: string) => {
    for (const [fragment, value] of Object.entries(rows)) {
      if (sql.includes(fragment)) return value;
    }
    return [];
  });
}

describe('business metrics measured from rows the product already holds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(0);
    mocks.readEconomicsSummary.mockResolvedValue(economics(0, 0));
  });

  function metric(summary: Awaited<ReturnType<typeof readProductMetrics>>, key: string) {
    return summary.metrics.find((entry) => entry.metric === key);
  }

  it('counts active users over the day, week and month windows', async () => {
    let call = 0;
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('count(distinct user_id) as users')) {
        call += 1;
        return [{ users: call * 10 }];
      }
      return [];
    });

    const summary = await readProductMetrics({ from: FROM, to: TO });

    expect(metric(summary, 'dau')?.value).toBe(10);
    expect(metric(summary, 'wau')?.value).toBe(20);
    expect(metric(summary, 'mau')?.value).toBe(30);
  });

  it('reports a cohort retention as returned over cohort size', async () => {
    answer({ 'as cohort_size': [{ cohort_size: 40, returned_users: 10 }] });

    const summary = await readProductMetrics({ from: FROM, to: TO });

    expect(metric(summary, 'retention_d1')).toMatchObject({
      numerator: 10,
      denominator: 40,
      value: 0.25,
    });
  });

  it('reports null, not zero, for a metric whose denominator is empty', async () => {
    answer({});

    const summary = await readProductMetrics({ from: FROM, to: TO });

    expect(metric(summary, 'retention_d30')?.value).toBeNull();
    expect(metric(summary, 'churn')?.value).toBeNull();
    expect(metric(summary, 'gross_margin')?.value).toBeNull();
  });

  it('measures churn against the paid count the snapshot recorded, not today’s', async () => {
    answer({
      'as churned': [{ churned: 3 }],
      'from public.product_metric_days': [{ numerator: 12 }],
    });

    const summary = await readProductMetrics({ from: FROM, to: TO });

    expect(metric(summary, 'churn')).toMatchObject({ numerator: 3, denominator: 12, value: 0.25 });
  });

  it('counts only an upgrade as expansion, never a downgrade', async () => {
    answer({
      "properties ->> 'planTier'": [
        { plan_tier: 'pro', previous_plan_tier: 'free', changes: 2 },
        { plan_tier: 'free', previous_plan_tier: 'pro', changes: 5 },
      ],
      'select plan_tier, count(*) as subscribers': [{ plan_tier: 'pro', subscribers: 4 }],
      'select count(*) as subscribers': [{ subscribers: 4 }],
    });

    const summary = await readProductMetrics({ from: FROM, to: TO });
    const expansion = metric(summary, 'expansion');

    expect(expansion?.numerator).toBeGreaterThan(0);
    expect(expansion?.denominator).toBeGreaterThan(0);
  });

  it('derives ARR from the live plan mix and ARPU from cash over monthly actives', async () => {
    mocks.readEconomicsSummary.mockResolvedValue(economics(6_000_000, 1_500_000));
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('count(distinct user_id) as users')) return [{ users: 3 }];
      if (sql.includes('select plan_tier, count(*) as subscribers')) {
        return [{ plan_tier: 'pro', subscribers: 1 }];
      }
      return [];
    });

    const summary = await readProductMetrics({ from: FROM, to: TO });
    const arr = metric(summary, 'arr_microusd');

    expect(arr?.value).toBeGreaterThan(0);
    expect(metric(summary, 'arpu_microusd')?.value).toBe(2_000_000);
    expect(metric(summary, 'gross_margin')?.value).toBeCloseTo(0.75, 5);
  });

  it('reports support cost as money actually adjusted, in microUSD', async () => {
    answer({ 'as amount_cents': [{ amount_cents: 250 }] });

    const summary = await readProductMetrics({ from: FROM, to: TO });

    expect(metric(summary, 'support_cost_microusd')?.value).toBe(2_500_000);
  });
});

describe('AI quality rates', () => {
  it('reads each rate off the event stream with the denominator it belongs to', () => {
    const rates = qualityMetrics([
      { event_name: 'assistant_response', outcome: 'succeeded', attempt: 1, events: 100 },
      { event_name: 'response_regenerated', outcome: null, attempt: 1, events: 12 },
      { event_name: 'generation_stopped', outcome: null, attempt: 1, events: 5 },
      { event_name: 'tool_call', outcome: 'succeeded', attempt: 1, events: 30 },
      { event_name: 'tool_call', outcome: 'failed', attempt: 1, events: 10 },
      { event_name: 'tool_call', outcome: 'succeeded', attempt: 2, events: 10 },
      { event_name: 'work_run_finished', outcome: 'succeeded', attempt: 1, events: 7 },
      { event_name: 'work_run_finished', outcome: 'failed', attempt: 1, events: 3 },
    ]);

    function value(metric: string) {
      return rates.find((rate) => rate.metric === metric)?.value;
    }

    expect(value('regenerate_rate')).toBeCloseTo(0.12, 5);
    expect(value('stop_rate')).toBeCloseTo(0.05, 5);
    expect(value('tool_failure_rate')).toBeCloseTo(0.2, 5);
    expect(value('tool_retry_rate')).toBeCloseTo(0.2, 5);
    expect(value('work_completion_rate')).toBeCloseTo(0.7, 5);
    expect(value('citation_failure_rate')).toBeNull();
  });
});

describe('the daily rollup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(4);
    mocks.readEconomicsSummary.mockResolvedValue(economics(0, 0));
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('select count(*) as subscribers')) return [{ subscribers: 9 }];
      return [];
    });
  });

  it('snapshots the paid count, which subscriptions overwrites and cannot answer later', async () => {
    await rollUpProductMetrics(new Date('2026-09-17T04:00:00.000Z'));

    const snapshot = mocks.execute.mock.calls
      .map((call) => call[1] as unknown[])
      .find((params) => params[1] === 'paid_subscribers');

    expect(snapshot?.[0]).toBe('2026-09-16');
    expect(snapshot?.[2]).toBe(9);
  });

  it('purges the raw stream past its retention window', async () => {
    await rollUpProductMetrics(new Date('2026-09-17T04:00:00.000Z'));

    const purge = mocks.execute.mock.calls.find((call) =>
      String(call[0]).includes('delete from public.product_analytics_events'),
    );

    expect(purge).toBeDefined();
    const cutoff = new Date(String((purge?.[1] as unknown[])[0]));
    const days = (Date.parse('2026-09-17T00:00:00.000Z') - cutoff.getTime()) / 86_400_000;
    expect(days).toBe(DEFAULT_PRODUCT_ANALYTICS_RETENTION_DAYS);
  });

  it('takes the retention window from the environment when it is set', () => {
    expect(resolveProductAnalyticsRetentionDays({ [PRODUCT_ANALYTICS_RETENTION_ENV]: '45' })).toBe(
      45,
    );
    expect(
      resolveProductAnalyticsRetentionDays({ [PRODUCT_ANALYTICS_RETENTION_ENV]: 'soon' }),
    ).toBe(DEFAULT_PRODUCT_ANALYTICS_RETENTION_DAYS);
  });
});
