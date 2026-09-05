import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listCanonicalModels } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const tx = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn() }));
const db = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
const scopedRead = { query: tx.query } as never;

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));

const logger = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger }));

import {
  FREE_TRIAL_INTERNAL_USAGE_POLICY,
  applyFreeTrialProviderBudget,
  beginFreeTrialRequest,
  estimateConservativeFreeInputTokens,
  fitFreeTrialOutputBudget,
  getFreeTrialPublicUsage,
  settleFreeTrialRequest,
} from './free-trial-service';
import { LLMCostCalculator } from './llm-cost-calculator';

const FIVE_HOUR_OLDEST = '2026-07-22T12:00:00.000Z';
const WEEKLY_OLDEST = '2026-07-18T12:00:00.000Z';
const ACCOUNT_PERIOD_END = '2026-08-10T08:30:00.000Z';
const TIERED_MODEL = (() => {
  const candidate = listCanonicalModels().find(
    (model) => (model.inputTokenPricingTiers?.length ?? 0) > 0,
  );
  const firstTier = candidate?.inputTokenPricingTiers?.[0];
  if (!candidate || !firstTier) throw new Error('Expected a catalog tiered-pricing fixture');
  return { ...candidate, firstTier };
})();
const FREE_CHAT_MODEL = (() => {
  const candidate = listCanonicalModels().find(
    (model) =>
      model.tierPolicy?.minTier === 'free' &&
      typeof model.contextWindow === 'number' &&
      typeof model.inputCost === 'number' &&
      typeof model.outputCost === 'number',
  );
  if (!candidate) throw new Error('Expected a priced Free chat fixture');
  return candidate;
})();
const ANTHROPIC_CHAT_MODEL = (() => {
  const candidate = listCanonicalModels().find(
    (model) =>
      model.provider === 'anthropic' &&
      typeof model.inputCost === 'number' &&
      typeof model.outputCost === 'number',
  );
  if (!candidate) throw new Error('Expected a priced Anthropic chat fixture');
  return candidate;
})();

type UsageSnapshot = {
  fiveHourUsedMicrousd?: number;
  weeklyUsedMicrousd?: number;
  monthlyUsedMicrousd?: number;
  fiveHourOldestAt?: string | null;
  weeklyOldestAt?: string | null;
  accountPeriodEnd?: string;
};

function usageRow(input: UsageSnapshot = {}) {
  return {
    five_hour_used_microusd: input.fiveHourUsedMicrousd ?? 0,
    weekly_used_microusd: input.weeklyUsedMicrousd ?? 0,
    monthly_used_microusd: input.monthlyUsedMicrousd ?? 0,
    five_hour_oldest_at: input.fiveHourOldestAt ?? null,
    weekly_oldest_at: input.weeklyOldestAt ?? null,
    account_period_end: input.accountPeriodEnd ?? ACCOUNT_PERIOD_END,
  };
}

function mockSettledReservation(row: Record<string, unknown> | null) {
  tx.query.mockImplementation(async (sql: string) =>
    sql.includes('from public.free_daily_usage_reservations') && row ? [row] : [],
  );
}

function mockAvailableQuota(input: UsageSnapshot = {}) {
  tx.query.mockImplementation(async (sql: string) => {
    if (sql.includes('from public.free_daily_usage_reservations') && sql.includes('request_id')) {
      return [];
    }
    if (sql.includes('for update') && sql.includes('website_auto_economy_trial_usage')) {
      return [{ user_id: 'user-1' }];
    }
    if (sql.includes('five_hour_used_microusd')) return [usageRow(input)];
    return [];
  });
}

describe('free trial service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.execute.mockResolvedValue(1);
    db.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    );
  });

  it('uses private 5-hour, rolling-week, and account-month limits with no daily cap', () => {
    expect(FREE_TRIAL_INTERNAL_USAGE_POLICY).toEqual({
      unitMicrousd: 5_000,
      fiveHourBudgetMicrousd: 25_000,
      fiveHourWindowHours: 5,
      weeklyBudgetMicrousd: 75_000,
      weeklyWindowHours: 168,
      monthlyBudgetMicrousd: 100_000,
    });
  });

  it('returns separate public percentages and resets without private operands', async () => {
    tx.query.mockImplementation(async (sql: string) => {
      if (sql.includes('five_hour_used_microusd')) {
        return [
          usageRow({
            fiveHourUsedMicrousd: 15_000,
            weeklyUsedMicrousd: 30_000,
            monthlyUsedMicrousd: 50_000,
            fiveHourOldestAt: FIVE_HOUR_OLDEST,
            weeklyOldestAt: WEEKLY_OLDEST,
          }),
        ];
      }
      return [];
    });

    const snapshot = await getFreeTrialPublicUsage(scopedRead, 'user-1');

    expect(snapshot).toEqual({
      usagePercentage: 50,
      resetAt: ACCOUNT_PERIOD_END,
      sessionUsagePercentage: 60,
      sessionResetAt: '2026-07-22T17:00:00.000Z',
      weeklyUsagePercentage: 40,
      weeklyResetAt: '2026-07-25T12:00:00.000Z',
      hasUsageRemaining: true,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/microusd|budget|cost|reserved/i);
    // The snapshot reads only the connection it was handed, never the
    // schema-owner pool that bypasses row-level security.
    expect(db.query).not.toHaveBeenCalled();
    expect(tx.query).toHaveBeenCalledWith(expect.stringContaining('five_hour_used_microusd'), [
      'user-1',
      FREE_TRIAL_INTERNAL_USAGE_POLICY.fiveHourWindowHours,
      FREE_TRIAL_INTERNAL_USAGE_POLICY.weeklyWindowHours,
    ]);
  });

  it('returns an unused account-month snapshot when no reservation exists', async () => {
    tx.query.mockImplementation(async (sql: string) => {
      if (sql.includes('five_hour_used_microusd')) return [usageRow()];
      return [];
    });

    await expect(getFreeTrialPublicUsage(scopedRead, 'user-1')).resolves.toEqual({
      usagePercentage: 0,
      resetAt: ACCOUNT_PERIOD_END,
      sessionUsagePercentage: 0,
      sessionResetAt: null,
      weeklyUsagePercentage: 0,
      weeklyResetAt: null,
      hasUsageRemaining: true,
    });
  });

  it('atomically reserves only the smallest remaining rolling allowance', async () => {
    mockAvailableQuota({
      fiveHourUsedMicrousd: 10_000,
      weeklyUsedMicrousd: 65_000,
      monthlyUsedMicrousd: 30_000,
    });

    await expect(
      beginFreeTrialRequest({ userId: 'user-1', requestId: 'request-1' }),
    ).resolves.toEqual({
      ok: true,
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-1',
        reservedMicrousd: 10_000,
      },
    });

    expect(tx.query).toHaveBeenCalledWith(
      expect.stringMatching(/website_auto_economy_trial_usage[\s\S]*for update/i),
      ['user-1'],
    );
    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringMatching(/insert into public\.free_daily_usage_reservations/i),
      ['user-1', 'request-1', 10_000],
    );
  });

  it.each([
    { fiveHourUsedMicrousd: 25_000 },
    { weeklyUsedMicrousd: 75_000 },
    { monthlyUsedMicrousd: 100_000 },
  ])('fails closed when any Free window is exhausted: %o', async (snapshot) => {
    mockAvailableQuota(snapshot);

    await expect(
      beginFreeTrialRequest({ userId: 'user-1', requestId: 'request-blocked' }),
    ).resolves.toEqual({ ok: false, code: 'budget_reached' });
    expect(tx.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('insert into public.free_daily_usage_reservations'),
      expect.anything(),
    );
  });

  it('rejects a replayed request id before provider egress', async () => {
    tx.query.mockImplementation(async (sql: string) => {
      if (sql.includes('website_auto_economy_trial_usage')) return [{ user_id: 'user-1' }];
      if (sql.includes('free_daily_usage_reservations')) {
        return [
          {
            window_started_at: FIVE_HOUR_OLDEST,
            reserved_microusd: 5_000,
            settled_at: null,
          },
        ];
      }
      return [];
    });

    await expect(
      beginFreeTrialRequest({ userId: 'user-1', requestId: 'request-replay' }),
    ).resolves.toEqual({ ok: false, code: 'budget_reached' });
  });

  it('caps one provider response to the private amount reserved for it', () => {
    const result = fitFreeTrialOutputBudget({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-budgeted',
        reservedMicrousd: 5_000,
      },
      provider: FREE_CHAT_MODEL.provider,
      model: FREE_CHAT_MODEL.id,
      estimatedInputTokens: 1_000,
      requestedMaxOutputTokens: 8_192,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.maxOutputTokens).toBeLessThan(8_192);
  });

  it('does not increase a caller output cap that already fits', () => {
    expect(
      fitFreeTrialOutputBudget({
        reservation: {
          kind: 'free_trial',
          userId: 'user-1',
          requestId: 'request-small',
          reservedMicrousd: 5_000,
        },
        provider: 'anthropic',
        model: ANTHROPIC_CHAT_MODEL.id,
        estimatedInputTokens: 100,
        requestedMaxOutputTokens: 32,
      }),
    ).toEqual({ ok: true, maxOutputTokens: 32 });
  });

  it('budgets the next provider call separately from prior subthreshold spend', () => {
    const subthresholdTokens = Math.floor(TIERED_MODEL.firstTier.thresholdTokens * 0.75);
    const priorCostDollars = LLMCostCalculator.calculateCostDollars(
      TIERED_MODEL.provider,
      TIERED_MODEL.id,
      {
        promptTokens: subthresholdTokens,
        completionTokens: 0,
        totalTokens: subthresholdTokens,
      },
    );
    const separateCallsDollars =
      priorCostDollars +
      LLMCostCalculator.calculateCostDollars(TIERED_MODEL.provider, TIERED_MODEL.id, {
        promptTokens: subthresholdTokens,
        completionTokens: 1,
        totalTokens: subthresholdTokens + 1,
      });
    const incorrectlyAggregatedDollars = LLMCostCalculator.calculateCostDollars(
      TIERED_MODEL.provider,
      TIERED_MODEL.id,
      {
        promptTokens: subthresholdTokens * 2,
        completionTokens: 1,
        totalTokens: subthresholdTokens * 2 + 1,
      },
    );
    expect(incorrectlyAggregatedDollars).toBeGreaterThan(separateCallsDollars);

    expect(
      fitFreeTrialOutputBudget({
        reservation: {
          kind: 'free_trial',
          userId: 'user-1',
          requestId: 'request-separated-calls',
          reservedMicrousd: Math.ceil(separateCallsDollars * 1_000_000),
        },
        provider: TIERED_MODEL.provider,
        model: TIERED_MODEL.id,
        estimatedInputTokens: subthresholdTokens,
        requestedMaxOutputTokens: 1,
        priorCostDollars,
      }),
    ).toEqual({ ok: true, maxOutputTokens: 1 });
  });

  it('uses a byte upper bound for text and the model input ceiling for images', () => {
    const textOnly = estimateConservativeFreeInputTokens({
      model: FREE_CHAT_MODEL.id,
      messages: [{ role: 'user', content: '🙂' }],
    });
    const withImage = estimateConservativeFreeInputTokens({
      model: FREE_CHAT_MODEL.id,
      messages: [
        {
          role: 'user',
          content: '',
          multimodal_content: [
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
          ],
        },
      ],
    });

    expect(textOnly).toBeGreaterThanOrEqual(new TextEncoder().encode('🙂').byteLength);
    expect(withImage).toBe(FREE_CHAT_MODEL.contextWindow);
  });

  it('applies the private cap to the provider request and disables cache writes', () => {
    const request = {
      model: FREE_CHAT_MODEL.id,
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 8_192,
      usePromptCache: true,
    };

    const result = applyFreeTrialProviderBudget({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-provider',
        reservedMicrousd: 5_000,
      },
      provider: FREE_CHAT_MODEL.provider,
      request,
    });

    expect(result.ok).toBe(true);
    expect(request.max_tokens).toBeLessThan(8_192);
    expect(request.usePromptCache).toBe(false);
  });

  it('charges one unit for a completed inexpensive response, not the full five-hour cap', async () => {
    mockSettledReservation({
      window_started_at: FIVE_HOUR_OLDEST,
      reserved_microusd: 25_000,
      settled_at: null,
    });

    await settleFreeTrialRequest({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-complete',
        reservedMicrousd: 25_000,
      },
      outcome: 'completed',
      provider: 'anthropic',
      model: ANTHROPIC_CHAT_MODEL.id,
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    });

    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /update public\.free_daily_usage_reservations[\s\S]*actual_cost_microusd = \$3/i,
      ),
      ['user-1', 'request-complete', 5_000, 'completed', expect.any(String)],
    );
    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /update public\.website_auto_economy_trial_usage[\s\S]*period_tokens_used/i,
      ),
      ['user-1', 120],
    );
  });

  it('releases a reservation after a zero-usage failure', async () => {
    mockSettledReservation({
      window_started_at: FIVE_HOUR_OLDEST,
      reserved_microusd: 25_000,
      settled_at: null,
    });

    await settleFreeTrialRequest({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-failed',
        reservedMicrousd: 25_000,
      },
      outcome: 'failed',
    });

    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringContaining('update public.free_daily_usage_reservations'),
      ['user-1', 'request-failed', 0, 'failed', expect.any(String)],
    );
  });

  it('treats repeated settlement as an idempotent no-op', async () => {
    mockSettledReservation({
      window_started_at: FIVE_HOUR_OLDEST,
      reserved_microusd: 5_000,
      settled_at: '2026-07-22T12:01:00.000Z',
    });

    await settleFreeTrialRequest({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-settled',
        reservedMicrousd: 5_000,
      },
      outcome: 'completed',
    });

    expect(tx.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('free_daily_usage_reservations'),
      expect.anything(),
    );
  });

  it('logs settlement failures without exposing private policy values', async () => {
    db.transaction.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      settleFreeTrialRequest({
        reservation: {
          kind: 'free_trial',
          userId: 'user-1',
          requestId: 'request-log',
          reservedMicrousd: 5_000,
        },
        outcome: 'failed',
      }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', requestId: 'request-log' }),
      'Free-tier usage settlement failed',
    );
  });
});
