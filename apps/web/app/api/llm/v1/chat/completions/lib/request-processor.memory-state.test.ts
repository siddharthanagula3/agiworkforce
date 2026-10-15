import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getAllowedModelsForTier, getModelMetadataById } from '@agiworkforce/types';

type FreeTrialModule = typeof import('@/lib/services/free-trial-service');
type ContentSafetyModule = typeof import('@/lib/services/managed-content-safety-service');
type MemoryModule = typeof import('@/lib/services/managed-memory-context-service');

vi.mock('@/lib/services/free-trial-service', async (importOriginal) => {
  const actual = await importOriginal<FreeTrialModule>();
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

vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => {
  const actual = await importOriginal<ContentSafetyModule>();
  return {
    ...actual,
    enforceManagedContentSafetyPreference: vi.fn(async () => ({ enabled: false, allowed: true })),
  };
});

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => {
    const { createDatabaseAdapterFake } = await import('@/test/database-adapter-fake');
    return { db: createDatabaseAdapterFake(), userId: 'user-free' };
  }),
}));

vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => {
  const actual = await importOriginal<MemoryModule>();
  return { ...actual, loadManagedMemoryPolicy: vi.fn(actual.loadManagedMemoryPolicy) };
});

import { loadManagedMemoryPolicy } from '@/lib/services/managed-memory-context-service';
import { processRequest } from './request-processor';

const FREE_CHAT_MODEL = (() => {
  const model = getAllowedModelsForTier('economy')
    .map((modelId) => getModelMetadataById(modelId))
    .find((candidate) => candidate?.tierPolicy?.minTier === 'free');
  if (!model) throw new Error('Canonical Free chat fixture is missing');
  return model.id;
})();

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

async function servedSystemPrompt(idempotencyKey: string): Promise<string> {
  const result = await processRequest(
    new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
        'x-agi-surface': 'web',
      },
      body: JSON.stringify({
        model: FREE_CHAT_MODEL,
        messages: [{ role: 'user', content: 'Plan my afternoon around two meetings.' }],
        stream: true,
      }),
    }),
    {
      ok: true,
      userId: 'user-free',
      token: 'session-token',
      boundSurface: 'web',
      subscription: freeSubscription,
    },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return '';
  return result.llmRequest.messages
    .filter((message) => message.role === 'system')
    .map((message) => (typeof message.content === 'string' ? message.content : ''))
    .join('\n');
}

describe('the memory line the served chat prompt carries (PC-F03)', () => {
  it('says memory is off when the setting was read and memory is off', async () => {
    expect(await servedSystemPrompt('free-memory-state-read')).toContain(
      'Memory is off for this conversation',
    );
  });

  it('does not say memory is off when the memory setting could not be read', async () => {
    vi.mocked(loadManagedMemoryPolicy).mockRejectedValueOnce(new Error('settings read failed'));

    const prompt = await servedSystemPrompt('free-memory-state-unreadable');

    expect(prompt).not.toContain('Memory is off for this conversation');
    expect(prompt).not.toContain('Memory is on.');
  });
});
