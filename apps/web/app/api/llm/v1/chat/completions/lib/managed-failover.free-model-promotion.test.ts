import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listCanonicalModels } from '@agiworkforce/types';
type ScanModule0 = typeof import('./request-processor');

const PROMOTED_MODEL = listCanonicalModels().find(
  (model) => model.provider === 'anthropic' && !!model.openRouterSlug,
)?.id;
if (!PROMOTED_MODEL) throw new Error('Canonical Anthropic OpenRouter fixture is missing');

type PromotionTestModule0 = typeof import('@/lib/logger');
type PromotionTestModule1 = typeof import('@/lib/services/provider-adapter-service');

const FREE_ROUTE_MODEL = vi.hoisted(() => 'fixture-free-route');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/free-trial-config', () => ({
  FREE_TRIAL_MODEL: FREE_ROUTE_MODEL,
  FREE_TRIAL_MODELS: [FREE_ROUTE_MODEL],
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule0>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/model-tiers', () => ({ canAccessModel: () => true }));
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<PromotionTestModule1>()),
  resolveProviderFromModel: (model: string) =>
    model === FREE_ROUTE_MODEL ? 'openrouter' : 'openai',
  listAvailableManagedProviderIds: () => new Set<string>(),
}));
vi.mock('./request-processor', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  resolveRequestEffort: vi.fn(() => undefined),
  buildThinkingConfig: vi.fn(() => undefined),
}));

import { createFailoverPlan } from './managed-failover';
import type { ProcessedRequest } from './request-processor';

const PROMOTION = {
  promotionId: 'test-promotion',
  credentialId: 'promotion-account',
  isolated: true,
  reservedMicrousd: 150_000,
};

function promotedTurn(requestedModel: string): ProcessedRequest {
  return {
    requestId: 'req-promotion-1',
    freeTrial: {
      kind: 'free_trial',
      userId: 'user-free',
      requestId: 'req-promotion-1',
      reservedMicrousd: 0,
      unmetered: true,
      promotion: PROMOTION,
    },
    chatRequest: {
      model: PROMOTED_MODEL,
      messages: [{ role: 'user', content: 'hi' }],
    } as unknown as ProcessedRequest['chatRequest'],
    conversationId: undefined,
    requestedModel,
    provider: 'anthropic',
    estimatedCostCents: 0,
    estimatedPromptTokens: 10,
    maxTokens: 100,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: requestedModel,
    fallbackModels: ['candidate-a'],
    fallbackRoutes: [
      { modelKey: 'candidate-a', provider: 'openai', routeId: 'openai/candidate-a' },
    ] as unknown as ProcessedRequest['fallbackRoutes'],
    subscriptionTier: 'free',
    resolvedTaskType: 'simple_chat',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as ProcessedRequest['quotaFeature'],
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: { isIndic: false } as ProcessedRequest['indicResult'],
    llmRequest: {
      model: PROMOTED_MODEL,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
    } as unknown as ProcessedRequest['llmRequest'],
  } as ProcessedRequest;
}

const unfunded = () =>
  Object.assign(new Error('Your credit balance is too low to access the API'), { status: 400 });

function plan(processed: ProcessedRequest, observed: string[] = []) {
  return createFailoverPlan(processed, {
    signal: new AbortController().signal,
    isProviderDispatchable: () => true,
    modelPolicy: null,
    onAttemptFailure: ({ category }) => observed.push(`attempt:${category}`),
    onResilienceObservation: ({ scope }) => observed.push(`resilience:${scope}`),
    onCredentialRejected: (provider) => observed.push(`rejected:${provider}`),
  });
}

const savedKey = process.env['OPENROUTER_API_KEY'];

beforeEach(() => {
  process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
});

afterEach(() => {
  if (savedKey === undefined) delete process.env['OPENROUTER_API_KEY'];
  else process.env['OPENROUTER_API_KEY'] = savedKey;
});

describe('managed failover for a turn the free model promotion pays for', () => {
  it('moves an unfunded promotion credential onto the free route, never another paid provider', () => {
    for (const requested of ['auto', PROMOTED_MODEL]) {
      const attempt = plan(promotedTurn(requested)).next(unfunded());

      expect(attempt?.model).toBe(FREE_ROUTE_MODEL);
      expect(attempt?.provider).toBe('openrouter');
      expect(attempt?.processed.freeTrial?.promotion?.isolated).toBe(false);
    }
  });

  it('falls back to the free route once on an availability failure, then stops', () => {
    const failover = plan(promotedTurn('auto'));
    const unavailable = () => Object.assign(new Error('upstream 503'), { status: 503 });

    expect(failover.next(unavailable())?.model).toBe(FREE_ROUTE_MODEL);
    expect(failover.next(unavailable())).toBeNull();
  });

  it('never shops a safety refusal onto the free route', () => {
    const attempt = plan(promotedTurn('auto')).next(
      Object.assign(new Error('content was blocked by safety'), { status: 400 }),
    );

    expect(attempt).toBeNull();
  });

  it('stays put once a function tool call has bound the turn to its provider', () => {
    const withTools = {
      ...promotedTurn('auto'),
      llmRequest: {
        ...promotedTurn('auto').llmRequest,
        tools: [{ type: 'function', function: { name: 'lookup', parameters: {} } }],
      },
    } as ProcessedRequest;

    expect(
      plan(withTools).next(Object.assign(new Error('upstream 503'), { status: 503 }), { step: 2 }),
    ).toBeNull();
  });

  it('keeps a turn that must not train off a free route that may', () => {
    const optedOut = { ...promotedTurn('auto'), noTrainingOnly: true } as ProcessedRequest;

    expect(plan(optedOut).next(unfunded())).toBeNull();
  });

  it('reports nothing to shared provider health, so paying accounts keep the provider', () => {
    const observed: string[] = [];

    plan(promotedTurn('auto'), observed).next(unfunded());
    plan(promotedTurn('auto'), observed).next(
      Object.assign(new Error('authentication error (401)'), { status: 401 }),
    );
    plan(promotedTurn('auto'), observed).next(
      Object.assign(new Error('rate limit (429)'), { status: 429 }),
    );

    expect(observed).toEqual([]);
  });

  it('still rotates the same Auto request when no promotion pays for it', () => {
    const unpromoted = { ...promotedTurn('auto'), freeTrial: undefined } as ProcessedRequest;

    expect(
      plan(unpromoted).next(Object.assign(new Error('upstream 503'), { status: 503 })),
    ).not.toBeNull();
  });
});
