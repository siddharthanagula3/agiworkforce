import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getDefaultModelFor } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/server/rls-db');
type ScanModule1 = typeof import('@/lib/services/managed-content-safety-service');
type ScanModule2 = typeof import('./chat-attachment-hydration');
type ScanModule3 = typeof import('@/lib/services/managed-memory-context-service');
type ScanModule4 = typeof import('@/lib/server/user-identity');
type ScanModule5 = typeof import('@/app/api/chat/conversations/[id]/messages/lib/persist-message');
type ScanModule6 = typeof import('@/lib/services/free-trial-service');

const FREE_CHAT_MODEL = getDefaultModelFor('free', 'chat');

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  persistMessage: vi.fn(),
  beginFree: vi.fn(),
  fitFree: vi.fn(),
  settleFree: vi.fn(),
  freeResetAt: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.scopedQuery },
    userId: 'user-free',
  })),
}));

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  enforceManagedContentSafetyPreference: mocks.enforceSafety,
}));

vi.mock('./chat-attachment-hydration', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  hydrateChatAttachments: mocks.hydrate,
}));

vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  loadManagedMemoryPolicy: mocks.loadPolicy,
}));

vi.mock('@/lib/server/user-identity', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  buildCustomInstructionsPreamble: mocks.customInstructions,
}));

vi.mock(
  '@/app/api/chat/conversations/[id]/messages/lib/persist-message',
  async (importOriginal) => ({
    ...(await importOriginal<ScanModule5>()),
    persistConversationMessage: mocks.persistMessage,
  }),
);

vi.mock('@/lib/services/free-trial-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  beginFreeTrialRequest: mocks.beginFree,
  applyFreeTrialProviderBudget: mocks.fitFree,
  settleFreeTrialRequest: mocks.settleFree,
  freeTrialResetAt: mocks.freeResetAt,
}));

import { processRequest } from './request-processor';

const freeSubscription = {
  id: 'sub-free',
  user_id: 'user-free',
  plan_tier: 'free',
  status: 'active' as const,
  current_period_start: new Date('2026-07-01T00:00:00Z'),
  current_period_end: new Date('2026-08-01T00:00:00Z'),
  stripe_subscription_id: null,
  stripe_price_id: null,
};

const RESERVATION = {
  kind: 'free_trial' as const,
  userId: 'user-free',
  requestId: 'free-window-1',
  reservedMicrousd: 7_500,
};

function freeTurn(key: string): Promise<Awaited<ReturnType<typeof processRequest>>> {
  const request = new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model: FREE_CHAT_MODEL,
      messages: [{ role: 'user', content: 'Hello there' }],
      stream: false,
    }),
  });
  return processRequest(request, {
    ok: true,
    userId: 'user-free',
    token: 'session-token',
    subscription: freeSubscription,
  });
}

async function refusal(result: Awaited<ReturnType<typeof processRequest>>) {
  if (result.ok) throw new Error('expected the Free turn to be refused');
  const body = (await result.response.json()) as { error: Record<string, unknown> };
  return { response: result.response, error: body.error };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue({
    enabled: false,
    generateFromHistory: false,
    allowToolAssistedGeneration: false,
  });
  mocks.customInstructions.mockResolvedValue(null);
  mocks.scopedQuery.mockResolvedValue([]);
  mocks.persistMessage.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000002' });
  mocks.beginFree.mockImplementation(async ({ requestId }: { requestId: string }) => ({
    ok: true,
    reservation: { ...RESERVATION, requestId },
  }));
  mocks.fitFree.mockReturnValue({ ok: true, maxOutputTokens: 1_024 });
  mocks.settleFree.mockResolvedValue(undefined);
  mocks.freeResetAt.mockResolvedValue(null);
});

describe('processRequest on the Free usage windows', () => {
  it('reserves a Free turn on the windows before the provider is called and fits its output to them', async () => {
    const result = await freeTurn('free-window-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mocks.beginFree).toHaveBeenCalledTimes(1);
    expect(mocks.beginFree).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-free',
        eventPromoted: false,
        leaseSeconds: expect.any(Number),
        provider: result.provider,
        model: result.llmRequest.model,
      }),
    );
    const begun = mocks.beginFree.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(begun['estimatedMicrousd']).toBeUndefined();
    expect(result.freeTrial).toEqual(
      expect.objectContaining({ kind: 'free_trial', reservedMicrousd: 7_500 }),
    );
    expect(result.managedUsage).toBeUndefined();
    expect(mocks.fitFree).toHaveBeenCalledWith(
      expect.objectContaining({ reservation: result.freeTrial, provider: result.provider }),
    );
  });

  it('refuses a Free turn at the limit with 429, the reset time and Retry-After', async () => {
    const resetAt = new Date(Date.now() + 3_600_000).toISOString();
    mocks.beginFree.mockResolvedValue({ ok: false, code: 'budget_reached', resetAt });

    const { response, error } = await refusal(await freeTurn('free-window-2'));

    expect(response.status).toBe(429);
    expect(error['code']).toBe('free_trial_token_budget_reached');
    expect(error['type']).toBe('insufficient_quota');
    expect(error['resets_at']).toBe(resetAt);
    const retryAfter = Number(response.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(3_590);
    expect(retryAfter).toBeLessThanOrEqual(3_600);
    expect(mocks.fitFree).not.toHaveBeenCalled();
  });

  it('refuses without inventing a reset when the windows did not name one', async () => {
    mocks.beginFree.mockResolvedValue({ ok: false, code: 'budget_reached', resetAt: null });

    const { response, error } = await refusal(await freeTurn('free-window-3'));

    expect(response.status).toBe(429);
    expect(error['code']).toBe('free_trial_token_budget_reached');
    expect(error).not.toHaveProperty('resets_at');
    expect(response.headers.has('Retry-After')).toBe(false);
  });

  it('gives the reservation back and refuses when it cannot cover a single output token', async () => {
    const resetAt = new Date(Date.now() + 600_000).toISOString();
    mocks.fitFree.mockReturnValue({ ok: false, code: 'budget_reached' });
    mocks.freeResetAt.mockResolvedValue(resetAt);

    const { response, error } = await refusal(await freeTurn('free-window-4'));

    expect(mocks.settleFree).toHaveBeenCalledWith({
      reservation: expect.objectContaining({ kind: 'free_trial', reservedMicrousd: 7_500 }),
      outcome: 'failed',
      attempt: { outcome: 'failed', errorClass: 'free_trial_token_budget_reached' },
    });
    expect(mocks.freeResetAt).toHaveBeenCalledWith('user-free');
    expect(response.status).toBe(429);
    expect(error['resets_at']).toBe(resetAt);
  });
});
