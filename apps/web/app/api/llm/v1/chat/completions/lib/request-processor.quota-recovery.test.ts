import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDefaultModelFor } from '@agiworkforce/types';

const PRO_CHAT_MODEL = getDefaultModelFor('pro', 'chat');

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  reserveManagedUsage: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.scopedQuery },
    userId: 'user-pro',
  })),
}));

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/managed-content-safety-service')>();
  return { ...actual, enforceManagedContentSafetyPreference: mocks.enforceSafety };
});

vi.mock('./chat-attachment-hydration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./chat-attachment-hydration')>();
  return { ...actual, hydrateChatAttachments: mocks.hydrate };
});

vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/managed-memory-context-service')>();
  return { ...actual, loadManagedMemoryPolicy: mocks.loadPolicy };
});

vi.mock('@/lib/server/user-identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/user-identity')>();
  return { ...actual, buildCustomInstructionsPreamble: mocks.customInstructions };
});

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>();
  return { ...actual, reserveManagedUsageRequest: mocks.reserveManagedUsage };
});

import { CreditService } from '@/lib/services/credit-service';
import { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';
import { processRequest } from './request-processor';
import type { AuthGateSuccess } from './auth-gate';

const stripeProSubscription = {
  id: 'sub-pro',
  user_id: 'user-pro',
  plan_tier: 'pro',
  status: 'active' as const,
  current_period_start: new Date('2026-07-01T00:00:00Z'),
  current_period_end: new Date('2026-08-01T00:00:00Z'),
  stripe_subscription_id: 'stripe-sub-pro',
  stripe_price_id: 'stripe-price-pro',
};

const appleProSubscription = {
  ...stripeProSubscription,
  stripe_subscription_id: null,
  stripe_price_id: null,
  apple_original_transaction_id: 'apple-txn-1',
};

const freeSubscription = {
  ...stripeProSubscription,
  plan_tier: 'free',
  stripe_subscription_id: null,
  stripe_price_id: null,
};

function auth(subscription: AuthGateSuccess['subscription']): AuthGateSuccess {
  return { ok: true, userId: 'user-pro', token: 'session-token', subscription };
}

function chatRequest(key: string): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model: PRO_CHAT_MODEL,
      messages: [{ role: 'user', content: 'Hello there' }],
      stream: false,
    }),
  });
}

async function refusalBody(
  key: string,
  subscription: AuthGateSuccess['subscription'],
): Promise<{ status: number; error: Record<string, unknown> }> {
  const result = await processRequest(chatRequest(key), auth(subscription));
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a refusal');
  const response = result.response as Response;
  const body = (await response.json()) as { error: Record<string, unknown> };
  return { status: response.status, error: body.error };
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.enforceSafety.mockReset();
  mocks.hydrate.mockReset();
  mocks.loadPolicy.mockReset();
  mocks.customInstructions.mockReset();
  mocks.scopedQuery.mockReset();
  mocks.reserveManagedUsage.mockReset();

  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue({
    enabled: false,
    generateFromHistory: false,
    allowToolAssistedGeneration: false,
  });
  mocks.customInstructions.mockResolvedValue(null);
  mocks.scopedQuery.mockResolvedValue([]);
  mocks.reserveManagedUsage.mockImplementation(
    async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
      db: { query: mocks.scopedQuery },
      userId: 'user-pro',
      idempotencyKey: 'lease-key',
      requestHash: 'hash',
      leaseToken: 'lease',
      estimatedCostCents,
    }),
  );

  vi.spyOn(CreditService, 'getBalance').mockResolvedValue({
    account_id: 'acct-pro',
    credits_allocated_cents: 1_000_000,
    credits_remaining_cents: 990_000,
    credits_used_cents: 10_000,
  } as Awaited<ReturnType<typeof CreditService.getBalance>>);
  vi.spyOn(CreditService, 'checkAvailable').mockResolvedValue(true);
});

describe('quota refusals carry a recovery destination', () => {
  it('points a Stripe-billed paid plan at the top-up purchase surface on a 402', async () => {
    vi.spyOn(CreditService, 'checkAvailable').mockResolvedValue(false);

    const { status, error } = await refusalBody('quota-recovery-1', stripeProSubscription);

    expect(status).toBe(402);
    expect(error['recovery']).toEqual({ action: 'top_up', href: '/settings/billing' });
  });

  it('offers an upgrade instead of a top-up when the account cannot buy credits', async () => {
    vi.spyOn(CreditService, 'checkAvailable').mockResolvedValue(false);

    const { status, error } = await refusalBody('quota-recovery-2', appleProSubscription);

    expect(status).toBe(402);
    expect(error['recovery']).toEqual({ action: 'upgrade', href: '/pricing' });
  });

  it('points a free plan blocked by the model gate at an upgrade', async () => {
    const { status, error } = await refusalBody('quota-recovery-3', freeSubscription);

    expect(status).toBe(403);
    expect(error['code']).toBe('free_trial_model_only');
    expect(error['recovery']).toEqual({ action: 'upgrade', href: '/pricing' });
  });

  it('offers a top-up on a rolling-window 429 that purchased credits can clear', async () => {
    mocks.reserveManagedUsage.mockRejectedValue(
      new ManagedUsageRequestError(
        'Your rolling 5-hour usage limit is reached.',
        429,
        'rolling_five_hour_limit_reached',
      ),
    );

    const { status, error } = await refusalBody('quota-recovery-4', stripeProSubscription);

    expect(status).toBe(429);
    expect(error['recovery']).toEqual({ action: 'top_up', href: '/settings/billing' });
  });

  it('omits recovery on refusals that are not quota blocks', async () => {
    mocks.reserveManagedUsage.mockRejectedValue(
      new ManagedUsageRequestError(
        'This idempotency key was already used for a different request body.',
        409,
        'idempotency_conflict',
      ),
    );

    const { status, error } = await refusalBody('quota-recovery-5', stripeProSubscription);

    expect(status).toBe(409);
    expect(error['recovery']).toBeUndefined();
  });
});
