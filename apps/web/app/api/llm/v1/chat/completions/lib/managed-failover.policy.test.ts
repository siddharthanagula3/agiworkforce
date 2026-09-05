import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { listCanonicalModels } from '@agiworkforce/types';

/**
 * The OpenRouter route-retry versus the workspace model policy.
 *
 * `next()` consults the route-retry BEFORE the candidate plan, and the retry is
 * not drawn from that plan, so the policy filtering applied to `fallbackModels`
 * in the request processor never governed it. A workspace pinned to
 * `allowedProviders: ['anthropic']` was still served through OpenRouter on any
 * availability-class failure.
 */

const ANTHROPIC_FAILOVER_MODEL = listCanonicalModels().find(
  (model) => model.provider === 'anthropic' && !!model.openRouterSlug,
)?.id;
if (!ANTHROPIC_FAILOVER_MODEL) {
  throw new Error('Canonical Anthropic OpenRouter failover fixture is missing');
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockCanAccessModel = vi.fn();
vi.mock('@/lib/model-tiers', () => ({
  canAccessModel: (...args: unknown[]) => mockCanAccessModel(...args),
}));

const mockResolveProviderFromModel = vi.fn();
vi.mock('@/lib/services/provider-adapter-service', () => ({
  resolveProviderFromModel: (...args: unknown[]) => mockResolveProviderFromModel(...args),
  listAvailableManagedProviderIds: () => new Set<string>(),
}));

vi.mock('./request-processor', () => ({
  resolveRequestEffort: vi.fn(() => undefined),
  buildThinkingConfig: vi.fn(() => undefined),
}));

import { createFailoverPlan } from './managed-failover';
import type { ProcessedRequest } from './request-processor';
import type { ModelAccessPolicy } from '@/lib/services/model-policy-evaluator';

function httpError(status: number, message = `upstream ${status}`): Error {
  return Object.assign(new Error(message), { status });
}

function policy(overrides: Partial<ModelAccessPolicy> = {}): ModelAccessPolicy {
  return {
    allowedProviders: [],
    blockedProviders: [],
    allowedModels: [],
    blockedModels: [],
    ...overrides,
  };
}

function anthropicRequest(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-policy-1',
    managedUsage: {
      db: {},
      userId: 'user-1',
      idempotencyKey: 'req-policy-1',
      requestHash: 'hash',
      leaseToken: 'lease-1',
      estimatedCostCents: 5,
    } as ProcessedRequest['managedUsage'],
    chatRequest: {
      model: ANTHROPIC_FAILOVER_MODEL,
      messages: [{ role: 'user', content: 'hi' }],
    } as unknown as ProcessedRequest['chatRequest'],
    conversationId: undefined,
    requestedModel: 'auto',
    provider: 'anthropic',
    estimatedCostCents: 5,
    estimatedPromptTokens: 10,
    maxTokens: 100,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'auto',
    fallbackModels: ['candidate-a', 'candidate-b'],
    subscriptionTier: 'pro',
    resolvedTaskType: 'simple_chat',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as ProcessedRequest['quotaFeature'],
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: { isIndic: false } as ProcessedRequest['indicResult'],
    llmRequest: {
      model: ANTHROPIC_FAILOVER_MODEL,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
    } as unknown as ProcessedRequest['llmRequest'],
    ...overrides,
  } as ProcessedRequest;
}

function makePlan(processed: ProcessedRequest, modelPolicy?: ModelAccessPolicy | null) {
  const controller = new AbortController();
  return createFailoverPlan(processed, {
    signal: controller.signal,
    isProviderDispatchable: () => true,
    modelPolicy: modelPolicy ?? null,
  });
}

const savedKey = process.env['OPENROUTER_API_KEY'];

beforeEach(() => {
  vi.clearAllMocks();
  process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
  mockCanAccessModel.mockReturnValue(true);
  mockResolveProviderFromModel.mockImplementation((model: string) =>
    model === 'candidate-a' ? 'openai' : 'google',
  );
});

afterEach(() => {
  if (savedKey === undefined) delete process.env['OPENROUTER_API_KEY'];
  else process.env['OPENROUTER_API_KEY'] = savedKey;
});

describe('OpenRouter route-retry obeys the workspace model policy', () => {
  it('does not route through OpenRouter when the workspace allows only Anthropic', () => {
    const plan = makePlan(anthropicRequest(), policy({ allowedProviders: ['anthropic'] }));

    const attempt = plan.next(httpError(503));

    expect(attempt?.provider).not.toBe('openrouter');
    expect(attempt?.processed.fallbackReason).not.toBe('openrouter_route_failover');
  });

  it('does not route through OpenRouter when the catalog-spelled provider is blocked', () => {
    // The stored spelling is the catalog `Provider` value; the retry dispatches
    // under the adapter spelling. Both must reach the same decision.
    const plan = makePlan(anthropicRequest(), policy({ blockedProviders: ['open_router'] }));

    const attempt = plan.next(httpError(503));

    expect(attempt?.provider).not.toBe('openrouter');
  });

  it('falls through to the ordinary candidate rotation instead of failing the request', () => {
    const plan = makePlan(anthropicRequest(), policy({ allowedProviders: ['anthropic'] }));

    const attempt = plan.next(httpError(503));

    expect(attempt).not.toBeNull();
    expect(attempt!.model).toBe('candidate-a');
    expect(attempt!.processed.fallbackReason).toBe('managed_failover');
  });

  it('a refused route-retry is not a spent retry: the whole plan stays available', () => {
    const plan = makePlan(anthropicRequest(), policy({ blockedProviders: ['open_router'] }));

    const first = plan.next(httpError(503));
    const second = plan.next(httpError(503));

    expect(first?.model).toBe('candidate-a');
    expect(second?.model).toBe('candidate-b');
  });

  it('fails the request only when policy forbids OpenRouter AND the plan is empty', () => {
    const plan = makePlan(
      anthropicRequest({ fallbackModels: [] }),
      policy({ allowedProviders: ['anthropic'] }),
    );

    expect(plan.next(httpError(503))).toBeNull();
  });

  it('still routes through OpenRouter when the policy permits that provider', () => {
    const plan = makePlan(
      anthropicRequest(),
      policy({ allowedProviders: ['anthropic', 'open_router'] }),
    );

    const attempt = plan.next(httpError(503));

    expect(attempt?.provider).toBe('openrouter');
    expect(attempt?.processed.fallbackReason).toBe('openrouter_route_failover');
  });

  it('still routes through OpenRouter for an ungoverned workspace', () => {
    const attempt = makePlan(anthropicRequest(), null).next(httpError(503));

    expect(attempt?.provider).toBe('openrouter');
  });

  it('still routes through OpenRouter when no policy option is supplied at all', () => {
    const controller = new AbortController();
    const plan = createFailoverPlan(anthropicRequest(), {
      signal: controller.signal,
      isProviderDispatchable: () => true,
    });

    expect(plan.next(httpError(503))?.provider).toBe('openrouter');
  });

  it('honours an explicit model allow over a provider block, per the evaluator precedence', () => {
    const plan = makePlan(
      anthropicRequest(),
      policy({
        blockedProviders: ['open_router'],
        allowedModels: [ANTHROPIC_FAILOVER_MODEL],
      }),
    );

    expect(plan.next(httpError(503))?.provider).toBe('openrouter');
  });

  it('refuses the route-retry on a credential failure too, not only availability errors', () => {
    const plan = makePlan(anthropicRequest(), policy({ blockedProviders: ['open_router'] }));

    const attempt = plan.next(httpError(401, 'authentication error'));

    expect(attempt?.provider).not.toBe('openrouter');
  });
});
