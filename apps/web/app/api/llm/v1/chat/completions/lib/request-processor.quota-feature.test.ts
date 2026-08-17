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
import { processRequest } from './request-processor';

const proSubscription = {
  id: 'sub-pro',
  user_id: 'user-pro',
  plan_tier: 'pro',
  status: 'active' as const,
  current_period_start: new Date('2026-07-01T00:00:00Z'),
  current_period_end: new Date('2026-08-01T00:00:00Z'),
  stripe_subscription_id: 'stripe-sub-pro',
  stripe_price_id: 'stripe-price-pro',
};

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

describe('metered-unit tagging on managed chat reservations', () => {
  it('reserves with the quota feature so the settled row can be counted against unit caps', async () => {
    const result = await processRequest(chatRequest('quota-feature-1'), {
      ok: true,
      userId: 'user-pro',
      token: 'session-token',
      subscription: proSubscription,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quotaFeature).toBe('chat');
    expect(mocks.reserveManagedUsage).toHaveBeenCalledWith(
      expect.objectContaining({ quotaFeature: 'chat' }),
    );
  });
});
