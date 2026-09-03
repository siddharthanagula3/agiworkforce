import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { getAllowedModelsForTier, listCanonicalModels } from '@agiworkforce/types';

const PRO_SEAT_MODELS = new Set(getAllowedModelsForTier('pro_additions'));
const ROUTED_MODEL = listCanonicalModels()
  .filter(
    (model) =>
      ['minimax', 'qwen', 'zhipu'].includes(model.provider) &&
      !!model.openRouterSlug &&
      PRO_SEAT_MODELS.has(model.id),
  )
  .sort((left, right) => left.id.localeCompare(right.id))[0];
if (!ROUTED_MODEL) {
  throw new Error('Canonical aggregator-routed model fixture is missing');
}
const ROUTED_VENDOR = ROUTED_MODEL.provider;

const mocks = vi.hoisted(() => ({
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  scopedQuery: vi.fn(),
  reserveManagedUsage: vi.fn(),
  organizationId: { value: null as string | null },
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.scopedQuery },
    userId: 'user-pro',
    organizationId: mocks.organizationId.value,
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
import { resolveProviderFromModel } from '@/lib/services/provider-adapter-service';
import { processRequest } from './request-processor';

const POLICY_TABLE = 'organization_model_policies';

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

interface PolicyLists {
  allowedProviders?: string[];
  blockedProviders?: string[];
  allowedModels?: string[];
  blockedModels?: string[];
}

function serveModelPolicy(policy: PolicyLists | null): void {
  mocks.scopedQuery.mockImplementation(async (sql: string) => {
    if (!sql.includes(POLICY_TABLE)) return [];
    if (!policy) return [];
    return [
      {
        organization_id: 'org-1',
        allowed_providers: policy.allowedProviders ?? [],
        blocked_providers: policy.blockedProviders ?? [],
        allowed_models: policy.allowedModels ?? [],
        blocked_models: policy.blockedModels ?? [],
        updated_by_user_id: 'admin-1',
        updated_at: '2026-08-01T00:00:00Z',
      },
    ];
  });
}

function chatRequest(key: string, model: string): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Summarise the agenda in two sentences.' }],
      stream: false,
    }),
  });
}

function run(key: string, model: string) {
  return processRequest(chatRequest(key, model), {
    ok: true,
    userId: 'user-pro',
    token: 'session-token',
    subscription: proSubscription,
  });
}

const savedOpenRouterKey = process.env['OPENROUTER_API_KEY'];

beforeEach(() => {
  vi.restoreAllMocks();
  // The whole point: the collapse only happens when OpenRouter is configured.
  process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
  mocks.enforceSafety.mockReset();
  mocks.hydrate.mockReset();
  mocks.loadPolicy.mockReset();
  mocks.customInstructions.mockReset();
  mocks.scopedQuery.mockReset();
  mocks.reserveManagedUsage.mockReset();
  mocks.organizationId.value = 'org-1';

  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue({
    enabled: false,
    generateFromHistory: false,
    allowToolAssistedGeneration: false,
  });
  mocks.customInstructions.mockResolvedValue(null);
  serveModelPolicy(null);
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

afterAll(() => {
  if (savedOpenRouterKey === undefined) delete process.env['OPENROUTER_API_KEY'];
  else process.env['OPENROUTER_API_KEY'] = savedOpenRouterKey;
});

describe('the primary gate asks about the vendor, not the aggregator carrying it', () => {
  it('confirms the dispatch layer really does collapse this vendor to openrouter', () => {
    // Guards the fixture: if this ever stops returning the aggregator, the two
    // tests below would pass for the wrong reason.
    expect(resolveProviderFromModel(ROUTED_MODEL.id)).toBe('openrouter');
    expect(ROUTED_VENDOR).not.toBe('openrouter');
  });

  it('refuses a model whose VENDOR the workspace blocked, though OpenRouter carries it', async () => {
    const ungoverned = await run('routed-block-baseline', ROUTED_MODEL.id);
    expect(ungoverned.ok, 'the fixture model must be runnable when ungoverned').toBe(true);

    serveModelPolicy({ blockedProviders: [ROUTED_VENDOR] });

    const result = await run('routed-block-vendor', ROUTED_MODEL.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toMatchObject({
      error: { code: 'provider_blocked' },
    });
  });

  it('admits a model whose VENDOR the workspace allowed, though OpenRouter carries it', async () => {
    serveModelPolicy({ allowedProviders: [ROUTED_VENDOR] });

    const result = await run('routed-allow-vendor', ROUTED_MODEL.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chatRequest.model).toBe(ROUTED_MODEL.id);
  });

  it('still refuses when the workspace blocked the aggregator transport itself', async () => {
    serveModelPolicy({ blockedProviders: ['open_router'] });

    const result = await run('routed-block-transport', ROUTED_MODEL.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toMatchObject({
      error: { code: 'provider_blocked' },
    });
  });

  it('still refuses a vendor that is on no allowlist', async () => {
    serveModelPolicy({ allowedProviders: ['anthropic'] });

    const result = await run('routed-allow-other', ROUTED_MODEL.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toMatchObject({
      error: { code: 'provider_not_allowed' },
    });
  });
});
