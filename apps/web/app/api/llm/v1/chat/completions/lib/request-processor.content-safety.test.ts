import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const safetyMocks = vi.hoisted(() => ({
  enforce: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: vi.fn() },
    userId: 'user-free',
  })),
}));

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/managed-content-safety-service')>();
  return {
    ...actual,
    enforceManagedContentSafetyPreference: safetyMocks.enforce,
  };
});

vi.mock('@/lib/services/free-trial-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/free-trial-service')>();
  return {
    ...actual,
    beginFreeTrialRequest: vi.fn(async ({ userId, requestId }) => ({
      ok: true,
      reservation: {
        kind: 'free_trial',
        userId,
        requestId,
        reservedMicrousd: 25_000,
      },
    })),
    applyFreeTrialProviderBudget: vi.fn(() => ({ ok: true, maxOutputTokens: 1_024 })),
    settleFreeTrialRequest: vi.fn(async () => undefined),
  };
});

import { processRequest } from './request-processor';

const freeSubscription = {
  id: 'sub-free',
  user_id: 'user-free',
  plan_tier: 'free',
  status: 'active' as const,
  current_period_start: new Date('2026-07-01T00:00:00Z'),
  current_period_end: new Date('2026-08-01T00:00:00Z'),
  stripe_subscription_id: 'stripe-sub-free',
  stripe_price_id: 'stripe-price-free',
};

function request(prompt: string): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `safety-${prompt.length}`,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model: 'gemini-3.5-flash-lite',
      messages: [
        { role: 'user', content: 'Earlier user message' },
        { role: 'assistant', content: 'Earlier assistant message' },
        { role: 'user', content: prompt },
      ],
      stream: false,
    }),
  });
}

describe('processRequest content-safety boundary', () => {
  it('returns the preference refusal before constructing a provider request', async () => {
    safetyMocks.enforce.mockResolvedValueOnce({
      enabled: true,
      allowed: false,
      refusal: 'Blocked by the account safety preference.',
    });

    const result = await processRequest(request('Unsafe latest prompt'), {
      ok: true,
      userId: 'user-free',
      token: 'session-token',
      subscription: freeSubscription,
    });

    expect(safetyMocks.enforce).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-free',
        prompt: 'Unsafe latest prompt',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(422);
      await expect(result.response.json()).resolves.toMatchObject({
        error: {
          code: 'reduce_sensitive_content',
          message: 'Blocked by the account safety preference.',
        },
      });
    }
  });

  it('fails closed when the account preference cannot be verified', async () => {
    safetyMocks.enforce.mockRejectedValueOnce(new Error('database unavailable'));

    const result = await processRequest(request('Ordinary prompt'), {
      ok: true,
      userId: 'user-free',
      token: 'session-token',
      subscription: freeSubscription,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
      await expect(result.response.json()).resolves.toMatchObject({
        error: {
          code: 'content_safety_preference_unavailable',
          message: expect.stringMatching(/No model request was sent/),
        },
      });
    }
  });
});
