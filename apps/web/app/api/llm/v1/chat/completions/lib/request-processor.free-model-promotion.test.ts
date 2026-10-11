import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getDefaultModelFor, modelsById, type ModelMetadata } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/server/rls-db');
type ScanModule1 = typeof import('@/lib/services/managed-content-safety-service');
type ScanModule2 = typeof import('./chat-attachment-hydration');
type ScanModule3 = typeof import('@/lib/services/managed-memory-context-service');
type ScanModule4 = typeof import('@/lib/server/user-identity');
type ScanModule5 = typeof import('@/app/api/chat/conversations/[id]/messages/lib/persist-message');
type ScanModule6 = typeof import('@/lib/services/free-trial-service');
type ScanModule7 = typeof import('./free-model-promotion-turn');
type ScanModule8 = typeof import('@/lib/server/free-model-promotion');

const FREE_CHAT_MODEL = getDefaultModelFor('free', 'chat');
const PROMOTED = Object.values(modelsById).find(
  (model: ModelMetadata) => model.provider === 'anthropic' && model.qualityTier === 'fast',
) as ModelMetadata;

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
  admit: vi.fn(),
  handOver: vi.fn(),
  release: vi.fn(),
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

vi.mock('@/lib/server/free-model-promotion', async (importOriginal) => {
  const actual = await importOriginal<ScanModule8>();
  const { modelsById: catalog } = await import('@agiworkforce/types');
  const promoted = Object.values(catalog).find(
    (model: ModelMetadata) => model.provider === 'anthropic' && model.qualityTier === 'fast',
  );
  return {
    ...actual,
    namesFreeModelPromotionModel: (selection: string) => selection === promoted?.id,
  };
});

vi.mock('./free-model-promotion-turn', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  admitFreeModelPromotionTurn: mocks.admit,
}));

import { processRequest } from './request-processor';
import { nativeSearchToolName } from '@/lib/web-search/required-search';

const PROMOTION_RESERVATION = {
  promotionId: 'test-promotion',
  credentialId: 'promotion-account',
  isolated: true,
  reservedMicrousd: 150_000,
};

const OUTPUT_CAP = 2_048;

const PROMOTION = {
  promotionId: 'test-promotion',
  provider: 'anthropic',
  modelId: PROMOTED.id,
  startsAtMs: 0,
  endsAtMs: Number.MAX_SAFE_INTEGER,
  spendCeilingMicrousd: 380_000_000,
  turnReserveMicrousd: 150_000,
  perUserMessages: { limit: 300, window: '5 h' },
  promptTokenCeiling: 100_000,
  promptBudgetTokens: 88_000,
  latestMessageTokenLimit: 40_000,
  imagePartTokenBound: 6_000,
  toolResultHistoryChars: 40_000,
  managedSpendRefreshMs: 60_000,
  outputTokenCap: OUTPUT_CAP,
  credentials: [],
};

function subscription(planTier: string) {
  return {
    id: `sub-${planTier}`,
    user_id: 'user-free',
    plan_tier: planTier,
    status: 'active' as const,
    current_period_start: new Date('2026-10-01T00:00:00Z'),
    current_period_end: new Date('2026-11-01T00:00:00Z'),
    stripe_subscription_id: null,
    stripe_price_id: null,
  };
}

function turn(
  key: string,
  model: string,
  content = 'Hello there',
  extra: Record<string, unknown> = {},
) {
  const request = new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      stream: false,
      thinking_mode: true,
      effort: 'high',
      ...extra,
    }),
  });
  return processRequest(request, {
    ok: true,
    userId: 'user-free',
    token: 'session-token',
    subscription: subscription('free'),
  });
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
  mocks.beginFree.mockImplementation(
    async ({ requestId, promotion }: { requestId: string; promotion?: unknown }) => ({
      ok: true,
      reservation: {
        kind: 'free_trial',
        userId: 'user-free',
        requestId,
        reservedMicrousd: 0,
        ...(promotion ? { unmetered: true, promotion } : {}),
      },
    }),
  );
  mocks.fitFree.mockImplementation(({ request }: { request: { max_tokens: number } }) => ({
    ok: true,
    maxOutputTokens: request.max_tokens,
  }));
  mocks.settleFree.mockResolvedValue(undefined);
  mocks.freeResetAt.mockResolvedValue(null);
  mocks.release.mockResolvedValue(undefined);
  mocks.admit.mockResolvedValue({
    promotion: PROMOTION,
    hold: {
      reservation: PROMOTION_RESERVATION,
      handOver: mocks.handOver,
      releaseUnlessHandedOver: mocks.release,
    },
  });
});

describe('processRequest under the free model promotion', () => {
  it('serves a Free account on the promoted model, outside its Free windows, at the cheapest reasoning', async () => {
    const result = await turn('promotion-turn-1', 'auto');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mocks.admit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-free', planTier: 'free', selection: 'auto' }),
    );
    expect(result.chatRequest.model).toBe(PROMOTED.id);
    expect(result.provider).toBe('anthropic');
    expect(result.llmRequest.thinking).toEqual({ type: 'disabled' });
    expect(result.llmRequest.effort).toBe('low');
    expect(result.maxTokens).toBeLessThanOrEqual(OUTPUT_CAP);
    expect(mocks.beginFree).toHaveBeenCalledWith(
      expect.objectContaining({ promotion: PROMOTION_RESERVATION, model: PROMOTED.id }),
    );
    expect(result.freeTrial).toEqual(
      expect.objectContaining({ unmetered: true, promotion: PROMOTION_RESERVATION }),
    );
    expect(mocks.handOver).toHaveBeenCalledTimes(1);
    expect(result.fallbackRoutes).toEqual([]);
    expect(result.freeLane).toBeUndefined();
    expect(result.managedUsage).toBeUndefined();
  });

  it('serves the promoted model the account picked by name the same way', async () => {
    const result = await turn('promotion-turn-2', PROMOTED.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatRequest.model).toBe(PROMOTED.id);
    expect(result.freeTrial?.promotion).toEqual(PROMOTION_RESERVATION);
  });

  it('routes a Free turn the promotion does not admit exactly as before', async () => {
    mocks.admit.mockResolvedValue(null);

    const result = await turn('promotion-turn-3', FREE_CHAT_MODEL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requestedModel).toBe(FREE_CHAT_MODEL);
    expect(result.freeTrial?.promotion).toBeUndefined();
    const begun = mocks.beginFree.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(begun['promotion']).toBeUndefined();
    expect(mocks.handOver).not.toHaveBeenCalled();
  });

  it('answers a Free account that picked the promoted model on the Free model once the promotion refuses it', async () => {
    mocks.admit.mockResolvedValue(null);

    const result = await turn('promotion-turn-7', PROMOTED.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requestedModel).toBe(FREE_CHAT_MODEL);
    expect(result.freeTrial?.promotion).toBeUndefined();
  });

  it('returns the hold when the turn is refused before the Free reservation takes it over', async () => {
    mocks.beginFree.mockResolvedValue({ ok: false, code: 'budget_reached', resetAt: null });

    const result = await turn('promotion-turn-4', 'auto');

    expect(result.ok).toBe(false);
    expect(mocks.handOver).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it('refuses with the promotion copy, not the Free limit, when a call cannot fit the promotion', async () => {
    mocks.fitFree.mockReturnValue({ ok: false, code: 'free_promotion_turn_limit' });

    const result = await turn('promotion-turn-5', 'auto');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const body = (await result.response.json()) as { error: Record<string, unknown> };
    expect(body.error['code']).toBe('free_promotion_turn_limit');
    expect(mocks.settleFree).toHaveBeenCalledWith(
      expect.objectContaining({
        reservation: expect.objectContaining({ promotion: PROMOTION_RESERVATION }),
        outcome: 'failed',
      }),
    );
    expect(mocks.freeResetAt).not.toHaveBeenCalled();
  });

  it('trims the history of a promoted turn under the prompt budget by the byte bound', async () => {
    const huge = 'y'.repeat(30_000);
    const request = new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'promotion-turn-6',
        'x-agi-surface': 'web',
      },
      body: JSON.stringify({
        model: 'auto',
        stream: false,
        messages: [
          { role: 'user', content: huge },
          { role: 'assistant', content: huge },
          { role: 'user', content: huge },
          { role: 'assistant', content: huge },
          { role: 'user', content: 'and now?' },
        ],
      }),
    });

    const result = await processRequest(request, {
      ok: true,
      userId: 'user-free',
      token: 'session-token',
      subscription: subscription('free'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bytes = new TextEncoder().encode(
      JSON.stringify(result.llmRequest.messages.map((message) => message.content)),
    ).byteLength;
    expect(bytes).toBeLessThanOrEqual(PROMOTION.promptBudgetTokens);
    expect(result.contextTrim?.droppedMessages).toBeGreaterThan(0);
  });

  it('offers provider web search on every promoted turn that asks for it', async () => {
    const searchTools = (result: Awaited<ReturnType<typeof processRequest>>) =>
      result.ok
        ? (result.llmRequest.tools ?? []).filter((tool) => nativeSearchToolName(tool) !== '')
        : null;

    for (const requestId of ['promotion-turn-8', 'promotion-turn-9']) {
      const result = await turn(requestId, 'auto', 'What is the news today?', {
        web_search: true,
        stream: true,
      });
      expect(searchTools(result)?.length).toBeGreaterThan(0);
      expect(result.ok && result.chatRequest.web_search).not.toBe(false);
    }
  });

  it('gives a short build request the whole promotion output cap', async () => {
    const result = await turn('promotion-turn-11', 'auto', 'make a calculator', { stream: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.llmRequest.max_tokens).toBe(OUTPUT_CAP);
    expect(result.maxTokens).toBe(OUTPUT_CAP);
  });

  it('plans no response budget for a continue turn, so the reply resumes at full length', async () => {
    const result = await turn('agi.chat.web.continue.promotion-turn-12', 'auto', 'Continue.', {
      stream: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.responseBudget).toBeUndefined();
    expect(result.llmRequest.max_tokens).toBe(OUTPUT_CAP);
    expect(JSON.stringify(result.llmRequest.messages)).not.toContain('concise');
  });

  it('requires and offers provider search when the account asks to search the web in its own words', async () => {
    const result = await turn(
      'promotion-turn-10',
      'auto',
      'can you search in the web and tell me his linkedin',
      { stream: true },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.searchRequirement).toEqual({ required: true, source: 'explicit_intent' });
    expect(
      (result.llmRequest.tools ?? []).filter((tool) => nativeSearchToolName(tool) !== '').length,
    ).toBeGreaterThan(0);
  });
});
