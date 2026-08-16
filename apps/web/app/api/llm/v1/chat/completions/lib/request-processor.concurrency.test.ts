import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getDefaultModelFor } from '@agiworkforce/types';

const FREE_CHAT_MODEL = getDefaultModelFor('free', 'chat');

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  reserveManagedUsage: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async (request: NextRequest) => ({
    db: { query: mocks.scopedQuery },
    userId: request.headers.get('x-test-user') ?? 'user-free',
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

vi.mock('@/lib/services/free-trial-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/free-trial-service')>();
  return {
    ...actual,
    beginFreeTrialRequest: vi.fn(async ({ userId, requestId }) => ({
      ok: true,
      reservation: { kind: 'free_trial', userId, requestId, reservedMicrousd: 25_000 },
    })),
    applyFreeTrialProviderBudget: vi.fn(() => ({ ok: true, maxOutputTokens: 1_024 })),
    settleFreeTrialRequest: vi.fn(async () => undefined),
  };
});

import { CreditService } from '@/lib/services/credit-service';
import { processRequest } from './request-processor';

const DISABLED_POLICY = {
  enabled: false,
  generateFromHistory: false,
  allowToolAssistedGeneration: false,
};

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

const proSubscription = {
  ...freeSubscription,
  id: 'sub-pro',
  user_id: 'user-pro',
  plan_tier: 'pro',
  stripe_subscription_id: 'stripe-sub-pro',
  stripe_price_id: 'stripe-price-pro',
};

function chatRequest(key: string, body: Record<string, unknown>, testUser?: string): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': 'web',
      ...(testUser ? { 'x-test-user': testUser } : {}),
    },
    body: JSON.stringify({
      model: FREE_CHAT_MODEL,
      messages: [{ role: 'user', content: 'Hello there' }],
      stream: false,
      ...body,
    }),
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const settleMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

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
  mocks.loadPolicy.mockResolvedValue(DISABLED_POLICY);
  mocks.customInstructions.mockResolvedValue(null);
  mocks.scopedQuery.mockResolvedValue([]);
});

describe('processRequest preflight concurrency', () => {
  it('reads the standing instructions while the safety preference is still in flight', async () => {
    const order: string[] = [];
    const safetyGate = deferred<void>();

    mocks.enforceSafety.mockImplementation(async () => {
      order.push('safety:start');
      await safetyGate.promise;
      order.push('safety:end');
      return { enabled: false, allowed: true };
    });
    mocks.customInstructions.mockImplementation(async () => {
      order.push('instructions:start');
      return null;
    });

    const pending = processRequest(chatRequest('perf-instructions-1', {}), {
      ok: true,
      userId: 'user-free',
      token: 'session-token',
      subscription: freeSubscription,
    });

    await settleMicrotasks();
    expect(order).toContain('instructions:start');
    expect(order).not.toContain('safety:end');

    safetyGate.resolve();
    await expect(pending).resolves.toMatchObject({ ok: true });
  });

  it('loads the memory policy while attachment hydration is still in flight', async () => {
    const order: string[] = [];
    const hydrationGate = deferred<void>();

    mocks.hydrate.mockImplementation(async () => {
      order.push('hydrate:start');
      await hydrationGate.promise;
      order.push('hydrate:end');
    });
    mocks.loadPolicy.mockImplementation(async () => {
      order.push('policy:start');
      return DISABLED_POLICY;
    });

    const pending = processRequest(chatRequest('perf-memory-1', {}), {
      ok: true,
      userId: 'user-free',
      token: 'session-token',
      subscription: freeSubscription,
    });

    await settleMicrotasks();
    expect(order).toContain('policy:start');
    expect(order).not.toContain('hydrate:end');

    hydrationGate.resolve();
    await expect(pending).resolves.toMatchObject({ ok: true });
  });

  it('checks the safety preference while the conversation ownership lookup is still in flight', async () => {
    const order: string[] = [];
    const ownershipGate = deferred<void>();
    const conversationId = '11111111-2222-4333-8444-555555555555';

    mocks.scopedQuery.mockImplementation(async () => {
      order.push('ownership:start');
      await ownershipGate.promise;
      order.push('ownership:end');
      return [{ id: conversationId, project_id: null, is_temporary: false }];
    });
    mocks.enforceSafety.mockImplementation(async () => {
      order.push('safety:start');
      return { enabled: false, allowed: true };
    });

    const pending = processRequest(
      chatRequest('perf-ownership-1', { conversation_id: conversationId }),
      {
        ok: true,
        userId: 'user-free',
        token: 'session-token',
        subscription: freeSubscription,
      },
    );

    await settleMicrotasks();
    expect(order).toContain('safety:start');
    expect(order).not.toContain('ownership:end');

    ownershipGate.resolve();
    await expect(pending).resolves.toMatchObject({ ok: true });
  });

  it('reads the credit balance once for both the routing bias and the credit gate', async () => {
    const getBalance = vi.spyOn(CreditService, 'getBalance').mockResolvedValue({
      account_id: 'acct-pro',
      credits_allocated_cents: 100_000,
      credits_remaining_cents: 90_000,
      credits_used_cents: 10_000,
    } as Awaited<ReturnType<typeof CreditService.getBalance>>);
    vi.spyOn(CreditService, 'checkAvailable').mockResolvedValue(true);
    mocks.reserveManagedUsage.mockImplementation(
      async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
        db: {},
        userId: 'user-pro',
        idempotencyKey: 'perf-balance-1',
        requestHash: 'hash',
        leaseToken: 'lease',
        estimatedCostCents,
      }),
    );

    const result = await processRequest(chatRequest('perf-balance-1', {}, 'user-pro'), {
      ok: true,
      userId: 'user-pro',
      token: 'session-token',
      subscription: proSubscription,
    });

    expect(result.ok).toBe(true);
    expect(getBalance).toHaveBeenCalledTimes(1);
  });

  it('re-reads the balance for the credit gate when the routing read failed', async () => {
    const getBalance = vi
      .spyOn(CreditService, 'getBalance')
      .mockRejectedValueOnce(new Error('balance read unavailable'))
      .mockResolvedValue({
        account_id: 'acct-pro',
        credits_allocated_cents: 100_000,
        credits_remaining_cents: 90_000,
        credits_used_cents: 10_000,
      } as Awaited<ReturnType<typeof CreditService.getBalance>>);
    vi.spyOn(CreditService, 'checkAvailable').mockResolvedValue(true);
    mocks.reserveManagedUsage.mockImplementation(
      async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
        db: {},
        userId: 'user-pro',
        idempotencyKey: 'perf-balance-2',
        requestHash: 'hash',
        leaseToken: 'lease',
        estimatedCostCents,
      }),
    );

    const result = await processRequest(chatRequest('perf-balance-2', {}, 'user-pro'), {
      ok: true,
      userId: 'user-pro',
      token: 'session-token',
      subscription: proSubscription,
    });

    expect(result.ok).toBe(true);
    expect(getBalance).toHaveBeenCalledTimes(2);
  });
});
