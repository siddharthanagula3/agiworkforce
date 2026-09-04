import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { getDefaultModelFor, getModelMetadataById } from '@agiworkforce/types';

/**
 * DEFECT B: the failover policy enforcement was dead code in production.
 *
 * `routeRetryAttempt` in managed-failover.ts refuses an OpenRouter route-retry
 * the workspace forbids, correct, and covered by managed-failover.policy.test
 *, but it reads the policy from `options.modelPolicy`, and no production
 * caller ever passed one. `ProcessedRequest` had no field to carry the
 * snapshot, and all four `createFailoverPlan` calls in route.ts passed only
 * `{ signal, isProviderDispatchable }`. At runtime the option was `undefined`,
 * which the evaluator reads as ungoverned, which allows. The enforcement
 * existed and never ran.
 *
 * Two halves, because the hole had two:
 *
 *   1. The processor must PUT the snapshot it already read on the request.
 *   2. route.ts must HAND it to every failover plan it builds.
 */

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
import { processRequest, type ProcessedRequest } from './request-processor';
import { createFailoverPlan } from './managed-failover';

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
      stream: true,
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

function httpError(status: number): Error {
  return Object.assign(new Error(`upstream ${status}`), { status });
}

/** Exactly the options literal route.ts builds, so the plumbing is what is under test. */
function planAsRouteDoes(processed: ProcessedRequest, signal: AbortSignal) {
  return createFailoverPlan(processed, {
    signal,
    isProviderDispatchable: () => true,
    modelPolicy: processed.modelPolicy ?? null,
  });
}

const savedOpenRouterKey = process.env['OPENROUTER_API_KEY'];

beforeEach(() => {
  vi.restoreAllMocks();
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

describe('the policy snapshot reaches managed failover from a real processed request', () => {
  it('carries the snapshot the primary gate was decided against', async () => {
    serveModelPolicy({ blockedProviders: ['open_router'] });

    const processed = await run('failover-snapshot', PRO_CHAT_MODEL);
    expect(processed.ok).toBe(true);
    if (!processed.ok) return;

    expect(processed.modelPolicy).not.toBeNull();
    expect(processed.modelPolicy?.blockedProviders).toContain('open_router');
  });

  it('does not rotate a governed workspace onto the forbidden aggregator', async () => {
    serveModelPolicy({ blockedProviders: ['open_router'] });

    const processed = await run('failover-governed', PRO_CHAT_MODEL);
    expect(processed.ok).toBe(true);
    if (!processed.ok) return;
    // The route-retry only exists for a model the catalog can carry there.
    expect(getModelMetadataById(processed.llmRequest.model)?.openRouterSlug).toBeTruthy();
    expect(processed.provider).not.toBe('openrouter');

    const controller = new AbortController();
    const attempt = planAsRouteDoes(processed, controller.signal).next(httpError(503));

    expect(attempt?.provider).not.toBe('openrouter');
    expect(attempt?.processed.fallbackReason).not.toBe('openrouter_route_failover');
  });

  it('still rotates onto the aggregator for an ungoverned workspace', async () => {
    serveModelPolicy(null);

    const processed = await run('failover-ungoverned', PRO_CHAT_MODEL);
    expect(processed.ok).toBe(true);
    if (!processed.ok) return;

    const controller = new AbortController();
    const attempt = planAsRouteDoes(processed, controller.signal).next(httpError(503));

    expect(attempt?.provider).toBe('openrouter');
    expect(attempt?.processed.fallbackReason).toBe('openrouter_route_failover');
  });
});

describe('every route.ts failover plan is handed the snapshot', () => {
  const routeSource = readFileSync(join(__dirname, '..', 'route.ts'), 'utf8');

  /** The options object of each `createFailoverPlan(` call, by brace matching. */
  function failoverPlanOptions(): string[] {
    const options: string[] = [];
    const marker = 'createFailoverPlan(';
    let from = 0;
    for (;;) {
      const at = routeSource.indexOf(marker, from);
      if (at === -1) break;
      let depth = 0;
      let end = at + marker.length - 1;
      for (let i = at + marker.length - 1; i < routeSource.length; i += 1) {
        const ch = routeSource[i];
        if (ch === '(') depth += 1;
        else if (ch === ')') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      options.push(routeSource.slice(at, end + 1));
      from = end + 1;
    }
    return options;
  }

  it('finds every call site and none of them is ungoverned', () => {
    const calls = failoverPlanOptions();
    // Four today: research loop, tool loop, streaming, non-streaming. A new one
    // must pass the snapshot too, which is the point of asserting on all of them.
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      expect(call, `a createFailoverPlan call site omits modelPolicy:\n${call}`).toContain(
        'modelPolicy:',
      );
    }
  });
});
