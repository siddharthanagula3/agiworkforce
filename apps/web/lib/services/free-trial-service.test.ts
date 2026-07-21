import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const tx = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
}));

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => db,
}));

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

const WINDOW_STARTED_AT = '2026-07-18T12:00:00.000Z';

function mockAvailableWindow(
  input: {
    costMicrousd?: number;
    reservedMicrousd?: number;
    expired?: boolean;
  } = {},
) {
  tx.query.mockImplementation(async (sql: string) => {
    if (sql.includes('from public.free_daily_usage_reservations')) return [];
    if (sql.includes('for update') && sql.includes('website_auto_economy_trial_usage')) {
      return [
        {
          daily_cost_microusd: input.costMicrousd ?? 0,
          daily_reserved_microusd: input.reservedMicrousd ?? 0,
          daily_started_at: WINDOW_STARTED_AT,
          window_expired: input.expired ?? false,
        },
      ];
    }
    if (sql.includes('returning daily_started_at')) {
      return [{ daily_started_at: WINDOW_STARTED_AT }];
    }
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

  it('uses a private daily cost ceiling', () => {
    expect(FREE_TRIAL_INTERNAL_USAGE_POLICY).toEqual({
      dailyBudgetMicrousd: 5_000,
      resetAfterHours: 24,
    });
  });

  it('returns only a public percentage and rolling reset for the active Free window', async () => {
    db.query.mockResolvedValueOnce([
      {
        daily_cost_microusd: 1_250,
        daily_reserved_microusd: 2_500,
        daily_started_at: WINDOW_STARTED_AT,
        window_expired: false,
      },
    ]);

    const snapshot = await getFreeTrialPublicUsage('user-1');

    expect(snapshot).toEqual({
      usagePercentage: 75,
      resetAt: '2026-07-19T12:00:00.000Z',
      hasUsageRemaining: true,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/microusd|budget|cost|reserved/i);
  });

  it('reports a fresh Free window after the rolling day expires', async () => {
    db.query.mockResolvedValueOnce([
      {
        daily_cost_microusd: 5_000,
        daily_reserved_microusd: 0,
        daily_started_at: WINDOW_STARTED_AT,
        window_expired: true,
      },
    ]);

    await expect(getFreeTrialPublicUsage('user-1')).resolves.toEqual({
      usagePercentage: 0,
      resetAt: null,
      hasUsageRemaining: true,
    });
  });

  it('atomically reserves the entire remaining window under a row lock', async () => {
    mockAvailableWindow({ costMicrousd: 1_250 });

    await expect(
      beginFreeTrialRequest({ userId: 'user-1', requestId: 'request-1' }),
    ).resolves.toEqual({
      ok: true,
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-1',
        reservedMicrousd: 3_750,
      },
    });

    expect(tx.query).toHaveBeenCalledWith(
      expect.stringMatching(/from public\.website_auto_economy_trial_usage[\s\S]*for update/i),
      ['user-1', FREE_TRIAL_INTERNAL_USAGE_POLICY.resetAfterHours],
    );
    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringMatching(/daily_reserved_microusd = daily_reserved_microusd \+ \$2/i),
      ['user-1', 3_750, WINDOW_STARTED_AT],
    );
    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.free_daily_usage_reservations'),
      ['user-1', 'request-1', WINDOW_STARTED_AT, 3_750],
    );
  });

  it('caps one provider response to the private amount reserved for it', () => {
    const result = fitFreeTrialOutputBudget({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-budgeted',
        reservedMicrousd: 5_000,
      },
      provider: 'openai',
      model: 'gpt-5.6-luna',
      estimatedInputTokens: 1_000,
      requestedMaxOutputTokens: 8_192,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.maxOutputTokens).toBeLessThan(8_192);
    expect(
      fitFreeTrialOutputBudget({
        reservation: {
          kind: 'free_trial',
          userId: 'user-1',
          requestId: 'request-budgeted',
          reservedMicrousd: 5_000,
        },
        provider: 'openai',
        model: 'gpt-5.6-luna',
        estimatedInputTokens: 1_000,
        requestedMaxOutputTokens: result.maxOutputTokens + 1,
      }),
    ).toEqual({ ok: true, maxOutputTokens: result.maxOutputTokens });
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
        provider: 'qwen',
        model: 'qwen-3.5-flash',
        estimatedInputTokens: 100,
        requestedMaxOutputTokens: 32,
      }),
    ).toEqual({ ok: true, maxOutputTokens: 32 });
  });

  it('fails closed when the next provider input leaves no room for output', () => {
    expect(
      fitFreeTrialOutputBudget({
        reservation: {
          kind: 'free_trial',
          userId: 'user-1',
          requestId: 'request-too-large',
          reservedMicrousd: 5_000,
        },
        provider: 'openai',
        model: 'gpt-5.6-luna',
        estimatedInputTokens: 5_000,
        requestedMaxOutputTokens: 1,
      }),
    ).toEqual({ ok: false, code: 'budget_reached' });
  });

  it('subtracts observed tool-loop usage before fitting the next provider turn', () => {
    const result = fitFreeTrialOutputBudget({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-loop',
        reservedMicrousd: 5_000,
      },
      provider: 'qwen',
      model: 'qwen-3.5-flash',
      estimatedInputTokens: 1_000,
      requestedMaxOutputTokens: 8_192,
      observedUsage: {
        promptTokens: 10_000,
        completionTokens: 9_000,
        totalTokens: 19_000,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.maxOutputTokens).toBeLessThan(8_192);
  });

  it('uses a byte upper bound for text and the model input ceiling for images', () => {
    const textOnly = estimateConservativeFreeInputTokens({
      model: 'gpt-5.6-luna',
      messages: [{ role: 'user', content: '🙂' }],
    });
    const withImage = estimateConservativeFreeInputTokens({
      model: 'gpt-5.6-luna',
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
    expect(withImage).toBe(1_050_000);
  });

  it('applies the private cap to the actual provider request and disables cache writes', () => {
    const request = {
      model: 'gpt-5.6-luna',
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [{ type: 'function', function: { name: 'lookup', parameters: {} } }],
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
      provider: 'openai',
      request,
    });

    expect(result.ok).toBe(true);
    expect(request.max_tokens).toBeLessThan(8_192);
    expect(request.usePromptCache).toBe(false);
  });

  it('rejects a concurrent request while the remaining window is reserved', async () => {
    mockAvailableWindow({ reservedMicrousd: FREE_TRIAL_INTERNAL_USAGE_POLICY.dailyBudgetMicrousd });

    const result = await beginFreeTrialRequest({ userId: 'user-1', requestId: 'request-2' });

    expect(result).toEqual({ ok: false, code: 'budget_reached' });
    expect(result).not.toHaveProperty('dailyBudgetMicrousd');
    expect(tx.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('insert into public.free_daily_usage_reservations'),
      expect.anything(),
    );
  });

  it('starts a new window without carrying an old active reservation into it', async () => {
    mockAvailableWindow({
      costMicrousd: 2_000,
      reservedMicrousd: 3_000,
      expired: true,
    });

    await expect(
      beginFreeTrialRequest({ userId: 'user-1', requestId: 'request-new-window' }),
    ).resolves.toMatchObject({ ok: true });

    expect(tx.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /daily_cost_microusd = 0,[\s\S]*daily_reserved_microusd = 0,[\s\S]*daily_started_at = now\(\)/i,
      ),
      ['user-1'],
    );
    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.free_daily_usage_reservations'),
      [
        'user-1',
        'request-new-window',
        expect.any(String),
        FREE_TRIAL_INTERNAL_USAGE_POLICY.dailyBudgetMicrousd,
      ],
    );
  });

  it('settles actual cost and releases unused reservation exactly once', async () => {
    tx.query.mockResolvedValueOnce([
      {
        window_started_at: WINDOW_STARTED_AT,
        reserved_microusd: 5_000,
        settled_at: null,
      },
    ]);

    await settleFreeTrialRequest({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-3',
        reservedMicrousd: 5_000,
      },
      outcome: 'completed',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      usage: { promptTokens: 100, completionTokens: 0, totalTokens: 100 },
    });

    expect(tx.query).toHaveBeenCalledWith(
      expect.stringMatching(/from public\.free_daily_usage_reservations[\s\S]*for update/i),
      ['user-1', 'request-3'],
    );
    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /daily_reserved_microusd = case[\s\S]*daily_started_at = \$2::timestamptz[\s\S]*daily_cost_microusd = case[\s\S]*daily_cost_microusd \+ \$4/i,
      ),
      ['user-1', WINDOW_STARTED_AT, 5_000, expect.any(Number), 100],
    );
    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /update public\.free_daily_usage_reservations[\s\S]*settled_at is null/i,
      ),
      [
        'user-1',
        'request-3',
        expect.any(Number),
        'completed',
        expect.stringContaining('"requestId":"request-3"'),
      ],
    );
  });

  it('does not charge a newer rolling window when an older reservation settles late', async () => {
    tx.query.mockResolvedValueOnce([
      {
        window_started_at: WINDOW_STARTED_AT,
        reserved_microusd: 5_000,
        settled_at: null,
      },
    ]);

    await settleFreeTrialRequest({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-late',
        reservedMicrousd: 5_000,
      },
      outcome: 'completed',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });

    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /daily_cost_microusd = case\s+when daily_started_at = \$2::timestamptz then daily_cost_microusd \+ \$4\s+else daily_cost_microusd end/i,
      ),
      expect.any(Array),
    );
  });

  it('releases a reservation after a zero-usage failure', async () => {
    tx.query.mockResolvedValueOnce([
      {
        window_started_at: WINDOW_STARTED_AT,
        reserved_microusd: 5_000,
        settled_at: null,
      },
    ]);

    await settleFreeTrialRequest({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-4',
        reservedMicrousd: 5_000,
      },
      outcome: 'failed',
    });

    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringContaining('daily_reserved_microusd = case'),
      ['user-1', WINDOW_STARTED_AT, 5_000, 0, 0],
    );
    expect(tx.execute).toHaveBeenCalledWith(
      expect.stringContaining('update public.free_daily_usage_reservations'),
      ['user-1', 'request-4', 0, 'failed', expect.any(String)],
    );
  });

  it('treats repeated settlement as an idempotent no-op', async () => {
    tx.query.mockResolvedValueOnce([
      {
        window_started_at: WINDOW_STARTED_AT,
        reserved_microusd: 5_000,
        settled_at: '2026-07-18T12:01:00.000Z',
      },
    ]);

    await settleFreeTrialRequest({
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-5',
        reservedMicrousd: 5_000,
      },
      outcome: 'completed',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      usage: { promptTokens: 42, completionTokens: 0, totalTokens: 42 },
    });

    expect(tx.execute).not.toHaveBeenCalled();
  });

  it('logs settlement failures without exposing private policy values', async () => {
    db.transaction.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      settleFreeTrialRequest({
        reservation: {
          kind: 'free_trial',
          userId: 'user-1',
          requestId: 'request-6',
          reservedMicrousd: 5_000,
        },
        outcome: 'failed',
      }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', requestId: 'request-6' }),
      'Free-tier usage settlement failed',
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('5000');
  });
});
