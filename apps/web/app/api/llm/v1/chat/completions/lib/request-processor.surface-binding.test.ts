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
import { MAP_SEARCH_TOOL_NAME } from '@/lib/services/map-search-tool-service';
import { processRequest } from './request-processor';
import type { AuthGateSuccess } from './auth-gate';

const DISABLED_POLICY = {
  enabled: false,
  generateFromHistory: false,
  allowToolAssistedGeneration: false,
};

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

function mapIntentRequest(key: string): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model: PRO_CHAT_MODEL,
      messages: [{ role: 'user', content: 'Show coffee shops near me on a map.' }],
      stream: true,
      x_interactive_cards: { supported: ['map-search.v1'], canRespond: false },
    }),
  });
}

function auth(overrides: Partial<AuthGateSuccess> = {}): AuthGateSuccess {
  return {
    ok: true,
    userId: 'user-pro',
    token: 'session-token',
    subscription: proSubscription,
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const mock of Object.values(mocks)) mock.mockReset();

  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue(DISABLED_POLICY);
  mocks.customInstructions.mockResolvedValue(null);
  mocks.scopedQuery.mockResolvedValue([]);
  mocks.reserveManagedUsage.mockImplementation(
    async ({ estimatedCostCents }: { estimatedCostCents: number }) => ({
      db: {},
      userId: 'user-pro',
      idempotencyKey: 'surface-binding',
      requestHash: 'hash',
      leaseToken: 'lease',
      estimatedCostCents,
    }),
  );

  vi.spyOn(CreditService, 'getBalance').mockResolvedValue({
    account_id: 'acct-pro',
    credits_allocated_cents: 100_000,
    credits_remaining_cents: 90_000,
    credits_used_cents: 10_000,
  } as Awaited<ReturnType<typeof CreditService.getBalance>>);
  vi.spyOn(CreditService, 'checkAvailable').mockResolvedValue(true);
});

describe('processRequest surface binding', () => {
  it('classifies a browser session by the advisory header and offers the web-only card', async () => {
    const result = await processRequest(mapIntentRequest('surface-web-1'), auth());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatSurface).toBe('web');
    expect(result.chatRequest.tools?.map((tool) => tool.function.name)).toContain(
      MAP_SEARCH_TOOL_NAME,
    );
  });

  it('pins a trusted developer credential to a developer surface despite a spoofed header', async () => {
    const result = await processRequest(
      mapIntentRequest('surface-dev-1'),
      auth({ surfaceClass: 'developer' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatSurface).toBe('cli');
    expect(result.chatRequest.tools ?? []).toEqual([]);
  });

  it('pins an API key to the api surface despite a spoofed header', async () => {
    const result = await processRequest(
      mapIntentRequest('surface-key-1'),
      auth({ token: 'sk_live_abc123' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatSurface).toBe('api');
    expect(result.chatRequest.tools ?? []).toEqual([]);
    expect(mocks.customInstructions).not.toHaveBeenCalled();
  });
});
