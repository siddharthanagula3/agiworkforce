import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
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
  beginFreeTrialRequest,
  recordFreeTrialTokens,
} from './free-trial-service';

describe('free trial service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.execute.mockResolvedValue(undefined);
  });

  it('uses a server-internal 200K token ceiling with a rolling 30-day reset', () => {
    expect(FREE_TRIAL_INTERNAL_USAGE_POLICY).toEqual({
      tokenBudget: 200_000,
      resetAfterDays: 30,
    });
  });

  it('begins a request when prior period usage is below the internal ceiling', async () => {
    db.query.mockResolvedValue([
      { period_tokens_used: FREE_TRIAL_INTERNAL_USAGE_POLICY.tokenBudget - 1 },
    ]);

    await expect(
      beginFreeTrialRequest({ userId: 'user-1', requestId: 'request-1' }),
    ).resolves.toEqual({
      ok: true,
      reservation: {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'request-1',
      },
    });

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("interval '1 day'"), [
      'user-1',
      FREE_TRIAL_INTERNAL_USAGE_POLICY.resetAfterDays,
    ]);
  });

  it('rejects a request without publishing the numeric ceiling', async () => {
    db.query.mockResolvedValue([
      { period_tokens_used: FREE_TRIAL_INTERNAL_USAGE_POLICY.tokenBudget },
    ]);

    const result = await beginFreeTrialRequest({ userId: 'user-1', requestId: 'request-2' });

    expect(result).toEqual({ ok: false, code: 'budget_reached' });
    expect(result).not.toHaveProperty('tokenBudget');
  });

  it('records actual whole tokens after a completed request', async () => {
    await recordFreeTrialTokens({ userId: 'user-1', requestId: 'request-3', tokens: 125.9 });

    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /insert into public\.usage_events[\s\S]*on conflict do nothing[\s\S]*period_tokens_used = t\.period_tokens_used \+ \$3/,
      ),
      [
        'user-1',
        'website_auto_economy_trial_tokens_recorded',
        125,
        JSON.stringify({ requestId: 'request-3', recordedTokens: 125 }),
      ],
    );
  });

  it('does not write a zero-token completion', async () => {
    await recordFreeTrialTokens({ userId: 'user-1', requestId: 'request-4', tokens: 0 });

    expect(db.execute).not.toHaveBeenCalled();
  });

  it('logs accounting failures without turning a provider success into a user failure', async () => {
    db.execute.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      recordFreeTrialTokens({ userId: 'user-1', requestId: 'request-5', tokens: 42 }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', requestId: 'request-5' }),
      'Free-tier token accounting failed',
    );
  });
});
