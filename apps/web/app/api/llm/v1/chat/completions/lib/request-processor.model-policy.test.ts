import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getRoutePricingForModel } from '@agiworkforce/model-registry';
import {
  GATEWAY_BACKED_HARNESS_IDS,
  getDefaultModelFor,
  getEconomyFallbackModels,
} from '@agiworkforce/types';

const PRO_CHAT_MODEL = getDefaultModelFor('pro', 'chat');

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

/** Answers the policy select and nothing else, so unrelated reads stay empty. */
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

function policyReadCount(): number {
  return mocks.scopedQuery.mock.calls.filter(([sql]) => String(sql).includes(POLICY_TABLE)).length;
}

/** A coding ask, because that is the task the router publishes fallbacks for. */
const ROTATABLE_PROMPT = 'Write a Python function that reverses a linked list in place.';

function chatRequest(key: string, model: string, message: string): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-agi-surface': 'web',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: message }],
      stream: false,
    }),
  });
}

function run(key: string, model: string, message = ROTATABLE_PROMPT) {
  return processRequest(chatRequest(key, model, message), {
    ok: true,
    userId: 'user-pro',
    token: 'session-token',
    subscription: proSubscription,
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

describe('workspace model policy is re-checked on every model this request can rotate onto', () => {
  it('keeps refusing the resolved model the workspace blocked', async () => {
    const baseline = await run('policy-baseline-primary', PRO_CHAT_MODEL);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;

    serveModelPolicy({ blockedModels: [baseline.chatRequest.model] });

    const result = await run('policy-primary-blocked', PRO_CHAT_MODEL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toMatchObject({
      error: { code: 'model_blocked' },
    });
  });

  it('drops a blocked model from the managed-failover plan instead of rotating onto it', async () => {
    const baseline = await run('policy-baseline-plan', 'auto');
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;

    const plan = baseline.fallbackModels ?? [];
    expect(plan.length, 'auto routing must publish fallback candidates to test').toBeGreaterThan(0);

    serveModelPolicy({ blockedModels: [plan[0] as string] });

    const governed = await run('policy-plan-filtered', 'auto');
    expect(governed.ok).toBe(true);
    if (!governed.ok) return;
    expect(governed.fallbackModels).not.toContain(plan[0]);
    expect(governed.fallbackModels).toEqual(plan.slice(1));
  });

  it('empties the failover plan when the workspace allows only the primary model', async () => {
    const baseline = await run('policy-baseline-only', 'auto');
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    expect((baseline.fallbackModels ?? []).length).toBeGreaterThan(0);

    serveModelPolicy({ allowedModels: [baseline.chatRequest.model] });

    const governed = await run('policy-plan-empty', 'auto');
    expect(governed.ok).toBe(true);
    if (!governed.ok) return;
    // Rotation-free, served by the primary model the gate already admitted.
    expect(governed.fallbackModels).toEqual([]);
  });

  it('downgrades to the cheapest ALLOWED model when credits run short', async () => {
    const economy = getEconomyFallbackModels().map((model) => model.model);
    expect(economy.length).toBeGreaterThan(1);

    const spend = vi.spyOn(CreditService, 'checkAvailable');
    spend.mockResolvedValueOnce(false).mockResolvedValue(true);

    const unrestricted = await run('policy-downgrade-baseline', PRO_CHAT_MODEL);
    expect(unrestricted.ok).toBe(true);
    if (!unrestricted.ok) return;
    expect(unrestricted.usedFallback).toBe(true);
    const cheapest = unrestricted.chatRequest.model;

    serveModelPolicy({ blockedModels: [cheapest] });
    spend.mockReset();
    spend.mockResolvedValueOnce(false).mockResolvedValue(true);

    const governed = await run('policy-downgrade-skips', PRO_CHAT_MODEL);
    expect(governed.ok).toBe(true);
    if (!governed.ok) return;
    expect(governed.usedFallback).toBe(true);
    expect(governed.chatRequest.model).not.toBe(cheapest);
  });

  it('refuses with the policy error when every cheaper model is blocked', async () => {
    const blocked = getEconomyFallbackModels()
      .map((model) => model.model)
      .filter((model) => model.toLowerCase() !== PRO_CHAT_MODEL.toLowerCase());
    serveModelPolicy({ blockedModels: blocked });

    vi.spyOn(CreditService, 'checkAvailable').mockResolvedValue(false);

    const result = await run('policy-downgrade-none', PRO_CHAT_MODEL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toMatchObject({
      error: { code: 'model_blocked' },
    });
  });

  it('answers with the policy refusal, not route ineligibility, when the model also carries a route the runtime does not admit', async () => {
    const baseline = await run('policy-precedence-baseline', PRO_CHAT_MODEL);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;

    const gatewayBacked = new Set(GATEWAY_BACKED_HARNESS_IDS);
    const unadmittedRoutes = getRoutePricingForModel(baseline.chatRequest.model).filter((route) =>
      gatewayBacked.has(route.harnessId),
    );
    expect(
      unadmittedRoutes.length,
      'the fixture model must carry a gateway-backed route for this precedence to be testable',
    ).toBeGreaterThan(0);

    serveModelPolicy({ blockedModels: [baseline.chatRequest.model] });

    const result = await run('policy-precedence-blocked', PRO_CHAT_MODEL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toMatchObject({
      error: { code: 'model_blocked' },
    });
  });

  it('reads the policy once per request, and not at all for a personal-scope caller', async () => {
    serveModelPolicy({ blockedModels: ['some-other-model'] });
    const governed = await run('policy-read-once', 'auto');
    expect(governed.ok).toBe(true);
    // One read, taken before routing so the resolver can refuse a governed
    // candidate, and reused by the primary gate and every downgrade after it.
    expect(policyReadCount()).toBe(1);

    mocks.scopedQuery.mockClear();
    mocks.organizationId.value = null;
    const personal = await run('policy-read-none', 'auto');
    expect(personal.ok).toBe(true);
    expect(policyReadCount()).toBe(0);
  });
});
