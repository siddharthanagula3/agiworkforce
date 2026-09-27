import { describe, expect, it } from 'vitest';
import { managedUsageBucketLabel, usageWorkloadLabel } from '@agiworkforce/types';
import { creditWindowRows, summarizeUsageHistory } from '../data/usagePresentation';
import { modelDisplayLabel } from '../features/model-picker/modelConstants';
import { UsageHistorySchema, type UsageHistory } from '../protocol/apiResponses';
import { requireCatalogModel } from './catalogModelFixtures';

const NOW = Date.parse('2026-09-27T12:00:00.000Z');
const MODEL = requireCatalogModel();

const SERVER_HISTORY = {
  userId: 'user-fixture',
  from: '2026-08-28T00:00:00.000Z',
  to: '2026-09-27T00:00:00.000Z',
  granularity: 'day',
  totals: { requests: 42, inputTokens: 120_000, outputTokens: 30_000, credits: 812.5 },
  periods: [
    { start: '2026-09-25T00:00:00.000Z', requests: 12, credits: 300 },
    { start: '2026-09-26T00:00:00.000Z', requests: 30, credits: 512.5 },
  ],
  byWorkload: [
    { key: 'chat', label: null, requests: 30, inputTokens: 1, outputTokens: 1, credits: 500 },
    { key: 'code', label: null, requests: 11, inputTokens: 1, outputTokens: 1, credits: 312 },
    { key: 'unknown', label: null, requests: 1, inputTokens: 1, outputTokens: 1, credits: 0.5 },
  ],
  byModel: [
    { key: MODEL.id, label: null, requests: 42, inputTokens: 1, outputTokens: 1, credits: 812.5 },
  ],
  byProject: [
    {
      key: 'project-fixture',
      label: 'Launch plan',
      requests: 20,
      inputTokens: 1,
      outputTokens: 1,
      credits: 400,
    },
  ],
  freshness: {
    asOf: '2026-09-27T00:00:00.000Z',
    latestActivityAt: '2026-09-26T23:00:00.000Z',
    unsettledRequests: 1,
  },
};

function history(overrides: Partial<UsageHistory> = {}): UsageHistory {
  return { ...UsageHistorySchema.parse(SERVER_HISTORY), ...overrides };
}

describe('usage history response', () => {
  it('reads the credits, periods and breakdowns the server publishes, byProject included', () => {
    const parsed = UsageHistorySchema.safeParse(SERVER_HISTORY);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.totals).toEqual({ requests: 42, credits: 812.5 });
    expect(parsed.data?.byWorkload.map((row) => row.key)).toEqual(['chat', 'code', 'unknown']);
    expect(parsed.data?.freshness).toEqual({ unsettledRequests: 1 });
  });

  it('rejects a negative credit figure instead of rendering it', () => {
    expect(
      UsageHistorySchema.safeParse({
        ...SERVER_HISTORY,
        totals: { ...SERVER_HISTORY.totals, credits: -1 },
      }).success,
    ).toBe(false);
  });
});

describe('usage history summary', () => {
  it('names each product area from the shared workload labels, in credits', () => {
    const summary = summarizeUsageHistory(history());

    expect(summary.byWorkload).toEqual([
      { label: usageWorkloadLabel('chat'), credits: '500 credits', requests: '30 requests' },
      { label: usageWorkloadLabel('code'), credits: '312 credits', requests: '11 requests' },
      { label: usageWorkloadLabel('unknown'), credits: '0.5 credits', requests: '1 request' },
    ]);
  });

  it('keeps a label the server resolved over the shared one', () => {
    const summary = summarizeUsageHistory(
      history({ byWorkload: [{ key: 'work', label: 'Launch automation', requests: 2, credits: 3 }] }),
    );

    expect(summary.byWorkload[0]?.label).toBe('Launch automation');
  });

  it('totals the range, lists models by display name and says what is still settling', () => {
    const summary = summarizeUsageHistory(history());

    expect(summary.rangeLabel).toBe('last 30 days');
    expect(summary.total).toBe('812.5 credits');
    expect(summary.totalRequests).toBe('42 requests');
    expect(summary.byModel).toEqual([
      { label: modelDisplayLabel(MODEL.id), credits: '812.5 credits', requests: '42 requests' },
    ]);
    expect(summary.unsettled).toBe('1 turn is still settling and not counted yet');
    expect(summarizeUsageHistory(history({ freshness: { unsettledRequests: 0 } })).unsettled).toBe(
      null,
    );
  });

  it('lists the newest periods first under the caption for their granularity', () => {
    const summary = summarizeUsageHistory(history());

    expect(summary.periodCaption).toBe('By day');
    expect(summary.byPeriod.map((row) => row.credits)).toEqual(['512.5 credits', '300 credits']);
  });
});

describe('credit window rows', () => {
  const credits = {
    monthly: { allowance: 2_000, used: 800, remaining: 1_200, reset_at: '2026-10-01T00:00:00.000Z' },
    weekly: { allowance: 500, used: 520, remaining: 0, reset_at: '2026-09-29T12:00:00.000Z' },
    five_hour: { allowance: 50, used: 12.5, remaining: 37.5, reset_at: '2026-09-27T14:30:00.000Z' },
    flagship_weekly: null,
    purchased: { remaining: null, overage_enabled: false },
  };

  it('states each window the plan has in credits with its own reset', () => {
    expect(creditWindowRows(credits, NOW)).toEqual([
      {
        bucket: 'session',
        label: managedUsageBucketLabel('session'),
        usage: 'Used 12.5 of 50 credits · 37.5 left',
        reset: 'Resets in 2 hr 30 min',
        usedPercent: 25,
      },
      {
        bucket: 'weekly',
        label: managedUsageBucketLabel('weekly'),
        usage: 'Used 520 of 500 credits · 0 left',
        reset: 'Resets in 2 days',
        usedPercent: 100,
      },
      {
        bucket: 'period',
        label: managedUsageBucketLabel('period'),
        usage: 'Used 800 of 2,000 credits · 1,200 left',
        reset: 'Resets in 4 days',
        usedPercent: 40,
      },
    ]);
  });

  it('omits a window the plan has no allowance for', () => {
    const rows = creditWindowRows(
      { ...credits, five_hour: { allowance: 0, used: 0, remaining: 0, reset_at: null } },
      NOW,
    );

    expect(rows.map((row) => row.bucket)).toEqual(['weekly', 'period']);
  });
});
