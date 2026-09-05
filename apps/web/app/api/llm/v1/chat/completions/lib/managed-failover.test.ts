import { describe, expect, it, vi, beforeEach } from 'vitest';
import { listCanonicalModels } from '@agiworkforce/types';

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
}));

vi.mock('./request-processor', () => ({
  resolveRequestEffort: vi.fn(() => undefined),
  buildThinkingConfig: vi.fn(() => undefined),
}));

import {
  createFailoverPlan,
  buildFailoverAttemptView,
  isNeverRotateCategory,
} from './managed-failover';
import { EmptyProviderResponseError } from '@agiworkforce/provider-runtime';
import type { ProcessedRequest } from './request-processor';

const FIRST_STEP = 1;

function httpError(status: number, message = `upstream ${status}`): Error {
  return Object.assign(new Error(message), { status });
}

function connectionError(): Error {
  return Object.assign(new Error('fetch failed: ECONNRESET'), { name: 'FetchError' });
}

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-1',
    managedUsage: {
      db: {},
      userId: 'user-1',
      idempotencyKey: 'req-1',
      requestHash: 'hash',
      leaseToken: 'lease-1',
      estimatedCostCents: 5,
    } as ProcessedRequest['managedUsage'],
    chatRequest: {
      model: 'primary-model',
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
      model: 'primary-model',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
    } as unknown as ProcessedRequest['llmRequest'],
    ...overrides,
  } as ProcessedRequest;
}

function makePlan(processed: ProcessedRequest, aborted = false) {
  const controller = new AbortController();
  if (aborted) controller.abort();
  return createFailoverPlan(processed, {
    signal: controller.signal,
    isProviderDispatchable: () => true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCanAccessModel.mockReturnValue(true);
  mockResolveProviderFromModel.mockImplementation((model: string) =>
    model === 'candidate-a' ? 'openai' : 'google',
  );
});

describe('rotation eligibility (gateway parity)', () => {
  it.each([
    ['connection (ECONNRESET)', connectionError()],
    ['server_error (503)', httpError(503)],
    ['server_error (500)', httpError(500)],
    ['server_overload (529)', httpError(529, '{"type":"overloaded_error"}')],
    ['rate limit (429)', httpError(429, 'rate limit exceeded')],
    [
      'quota exhausted (429 insufficient_quota)',
      httpError(429, 'insufficient_quota: exceeded your current quota'),
    ],
    [
      'spending cap (429, no other quota marker)',
      httpError(429, 'You have hit your spending cap for this project'),
    ],
    ['api_timeout', Object.assign(new Error('request timeout'), {})],
    ['credential failure (401)', httpError(401, 'authentication error (401)')],
    ['forbidden (403)', httpError(403, 'permission denied')],
    ['revoked oauth token', new Error('This oauth token has been revoked')],
    ['disabled organization', httpError(403, 'Your organization has been disabled')],
    ['empty provider response', new EmptyProviderResponseError('length')],
  ])('rotates on %s', (_label, error) => {
    const attempt = makePlan(makeProcessed()).next(error);
    expect(attempt).not.toBeNull();
    expect(attempt!.model).toBe('candidate-a');
  });

  it('never rotates a content-blocked finish: a refusal must never be shopped around providers', () => {
    expect(isNeverRotateCategory('content_blocked')).toBe(true);
  });

  it('never rotates on an exhausted credit balance', () => {
    // Inverted deliberately. This case used to sit in the list above, because
    // "credit balance is too low" classified as `auth` and every `auth` is a
    // rotation trigger. That meant an account which had merely run out of money
    // was pushed onto a DIFFERENT PAID provider and spent more there. An
    // unfunded credential is a valid credential: the failure is an operator
    // problem and must surface, not be paid around.
    const attempt = makePlan(makeProcessed()).next(new Error('Your credit balance is too low'));
    expect(attempt).toBeNull();
  });

  it('skips the rejected provider’s own remaining routes rather than replaying the same key', () => {
    mockResolveProviderFromModel.mockImplementation((model: string) =>
      model === 'candidate-a' ? 'anthropic' : 'google',
    );

    const attempt = makePlan(makeProcessed()).next(httpError(401, 'authentication error (401)'));

    expect(attempt?.model).toBe('candidate-b');
    expect(attempt?.provider).toBe('google');
  });

  it('does not rotate when every remaining route is on the rejected provider', () => {
    mockResolveProviderFromModel.mockReturnValue('anthropic');
    expect(makePlan(makeProcessed()).next(httpError(401, 'authentication error (401)'))).toBeNull();
  });

  it('condemns only the provider that was rejected, not one that merely 503d', () => {
    mockResolveProviderFromModel.mockReturnValue('openai');
    const plan = makePlan(makeProcessed());
    expect(plan.next(httpError(503))?.model).toBe('candidate-a');
    expect(plan.next(httpError(503))?.model).toBe('candidate-b');
  });

  it.each([
    ['client error (400)', httpError(400, 'bad request')],
    ['context overflow', new Error('prompt is too long: 250000 tokens')],
    ['invalid model', new Error('model not found: nope')],
    ['unknown (no status)', new Error('Anthropic API error (503): mapped without status')],
  ])('never rotates on %s', (_label, error) => {
    expect(makePlan(makeProcessed()).next(error)).toBeNull();
  });

  it('never rotates after a client abort, even on an availability failure', () => {
    expect(makePlan(makeProcessed(), true).next(httpError(503))).toBeNull();
  });

  it('never rotates an explicit selection: the resolver emits an empty plan (structural, not a conditional)', () => {
    const processed = makeProcessed({ fallbackModels: [] });
    expect(makePlan(processed).next(httpError(503))).toBeNull();
  });

  it('leaves an explicit selection on a quota-exhausted answer for its own normalized error', () => {
    const processed = makeProcessed({ fallbackModels: [] });
    const attempt = makePlan(processed).next(
      httpError(429, 'insufficient_quota: exceeded your current quota'),
    );
    expect(attempt).toBeNull();
  });

  it('walks the whole auto ladder once on quota exhaustion, then stops', () => {
    const plan = makePlan(makeProcessed());
    const quotaExhausted = () => httpError(429, 'insufficient_quota: exceeded your current quota');
    expect(plan.next(quotaExhausted())?.model).toBe('candidate-a');
    expect(plan.next(quotaExhausted())?.model).toBe('candidate-b');
    expect(plan.next(quotaExhausted())).toBeNull();
  });

  it('does not rotate a tool-bearing request across providers', () => {
    const processed = makeProcessed();
    (processed.llmRequest as { tools?: unknown[] }).tools = [{ name: 'web_search' }];
    expect(makePlan(processed).next(httpError(503))).toBeNull();
  });

  it('rotates an auto-routed request the provider refused, on the first step', () => {
    const attempt = makePlan(makeProcessed()).next(httpError(400, 'bad request'), {
      step: FIRST_STEP,
    });

    expect(attempt?.model).toBe('candidate-a');
  });

  it('leaves an explicitly selected model on the rejection the caller asked for', () => {
    const processed = makeProcessed({
      requestedModel: ANTHROPIC_FAILOVER_MODEL,
      originalModel: ANTHROPIC_FAILOVER_MODEL,
    });

    expect(
      makePlan(processed).next(httpError(400, 'bad request'), { step: FIRST_STEP }),
    ).toBeNull();
  });

  it('will not splice a second model into an answer a later step already started', () => {
    expect(
      makePlan(makeProcessed()).next(httpError(400, 'bad request'), { step: FIRST_STEP + 1 }),
    ).toBeNull();
  });

  it.each([
    ['not found (404)', httpError(404, 'no such route')],
    ['unprocessable (422)', httpError(422, 'unprocessable entity')],
  ])('does not extend the rejection rotation to %s', (_label, error) => {
    expect(makePlan(makeProcessed()).next(error, { step: FIRST_STEP })).toBeNull();
  });

  it.each([
    ['unauthorized (401)', httpError(401, 'authentication error (401)')],
    ['forbidden (403)', httpError(403, 'permission denied')],
  ])('leaves %s on provider condemnation, which the step context does not change', (_, error) => {
    const withContext = makePlan(makeProcessed()).next(error, { step: FIRST_STEP });
    const withoutContext = makePlan(makeProcessed()).next(error);

    expect(withContext?.model).toBe(withoutContext?.model);
    expect(withContext?.processed.fallbackReason).toBe('managed_failover');
  });

  it('rotates a tool-bearing request to a same-provider fallback', () => {
    mockResolveProviderFromModel.mockImplementation((model: string) =>
      model === 'candidate-a' ? 'openai' : 'anthropic',
    );
    const processed = makeProcessed();
    (processed.llmRequest as { tools?: unknown[] }).tools = [{ name: 'web_search' }];

    const attempt = makePlan(processed).next(httpError(429, 'rate limit exceeded'));

    expect(attempt?.model).toBe('candidate-b');
    expect(attempt?.provider).toBe('anthropic');
  });
});

describe('per-attempt admission re-check', () => {
  it('skips a candidate the tier ladder no longer admits and serves the next one', () => {
    mockCanAccessModel.mockImplementation((model: string) => model !== 'candidate-a');
    const attempt = makePlan(makeProcessed()).next(httpError(503));
    expect(attempt).not.toBeNull();
    expect(attempt!.model).toBe('candidate-b');
    expect(mockCanAccessModel).toHaveBeenCalledWith('candidate-a', 'pro');
    expect(mockCanAccessModel).toHaveBeenCalledWith('candidate-b', 'pro');
  });

  it('skips a candidate whose provider cannot be resolved or dispatched', () => {
    mockResolveProviderFromModel.mockImplementation((model: string) => {
      if (model === 'candidate-a') throw new Error('unknown model');
      return 'google';
    });
    const attempt = makePlan(makeProcessed()).next(httpError(503));
    expect(attempt!.model).toBe('candidate-b');
  });

  it('returns null when every candidate fails admission (original failure surfaces)', () => {
    mockCanAccessModel.mockReturnValue(false);
    expect(makePlan(makeProcessed()).next(httpError(503))).toBeNull();
  });

  it('is bounded by the plan: candidates are consumed once, never recycled', () => {
    const plan = makePlan(makeProcessed());
    expect(plan.next(httpError(503))!.model).toBe('candidate-a');
    expect(plan.next(httpError(503))!.model).toBe('candidate-b');
    expect(plan.next(httpError(503))).toBeNull();
  });
});

describe('attempt view (attribution + single reservation)', () => {
  it('swaps the serving model/provider, marks the managed-failover fallback, and carries the SAME reservation through', () => {
    const processed = makeProcessed();
    const view = buildFailoverAttemptView(processed, 'candidate-a', 'openai');

    expect(view.chatRequest.model).toBe('candidate-a');
    expect(view.llmRequest.model).toBe('candidate-a');
    expect(view.provider).toBe('openai');
    expect(view.usedFallback).toBe(true);
    expect(view.fallbackReason).toBe('managed_failover');
    expect(view.managedUsage).toBe(processed.managedUsage);
    expect(view.requestId).toBe(processed.requestId);
    expect(processed.chatRequest.model).toBe('primary-model');
    expect(processed.usedFallback).toBe(false);
  });

  it('counts each rotation as one retry and leaves the un-rotated request unknown', () => {
    const processed = makeProcessed();
    expect(processed.retries).toBeUndefined();

    const first = buildFailoverAttemptView(processed, 'candidate-a', 'openai');
    expect(first.retries).toBe(1);

    const second = buildFailoverAttemptView(first, 'candidate-b', 'openai');
    expect(second.retries).toBe(2);

    expect(processed.retries).toBeUndefined();
    expect(first.retries).toBe(1);
  });

  it('increments retries across successive plan rotations (production call shape)', () => {
    const plan = makePlan(makeProcessed());

    const first = plan.next(httpError(503));
    expect(first).not.toBeNull();
    expect(first!.processed.retries).toBe(1);

    const second = plan.next(httpError(503));
    expect(second).not.toBeNull();
    expect(second!.model).not.toBe(first!.model);
    expect(second!.processed.retries).toBe(2);
  });
});

describe('OpenRouter route failover', () => {
  const savedKey = process.env['OPENROUTER_API_KEY'];

  beforeEach(() => {
    process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env['OPENROUTER_API_KEY'];
    else process.env['OPENROUTER_API_KEY'] = savedKey;
  });

  function anthropicRequest(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
    return makeProcessed({
      provider: 'anthropic',
      chatRequest: {
        model: ANTHROPIC_FAILOVER_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
      } as unknown as ProcessedRequest['chatRequest'],
      llmRequest: {
        model: ANTHROPIC_FAILOVER_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 100,
      } as unknown as ProcessedRequest['llmRequest'],
      ...overrides,
    });
  }

  it('retries the same model on OpenRouter instead of switching model', () => {
    const attempt = makePlan(anthropicRequest()).next(httpError(503));
    expect(attempt).not.toBeNull();
    expect(attempt!.provider).toBe('openrouter');
    expect(attempt!.model).toBe(ANTHROPIC_FAILOVER_MODEL);
    expect(attempt!.processed.fallbackReason).toBe('openrouter_route_failover');
  });

  it('works for an explicit selection, which model rotation cannot serve', () => {
    const attempt = makePlan(anthropicRequest({ fallbackModels: [] })).next(httpError(503));
    expect(attempt?.provider).toBe('openrouter');
    expect(attempt?.model).toBe(ANTHROPIC_FAILOVER_MODEL);
  });

  it('is attempted at most once, then falls through to model rotation', () => {
    const plan = makePlan(anthropicRequest());
    expect(plan.next(httpError(503))?.provider).toBe('openrouter');
    const second = plan.next(httpError(503));
    expect(second?.provider).not.toBe('openrouter');
    expect(second?.model).toBe('candidate-a');
  });

  it('does not fire without an OpenRouter key', () => {
    delete process.env['OPENROUTER_API_KEY'];
    const attempt = makePlan(anthropicRequest({ fallbackModels: [] })).next(httpError(503));
    expect(attempt).toBeNull();
  });

  it('fires on a credential failure: OpenRouter carries its own key for the same model', () => {
    const attempt = makePlan(anthropicRequest()).next(httpError(401, 'authentication error'));
    expect(attempt?.provider).toBe('openrouter');
    expect(attempt?.model).toBe(ANTHROPIC_FAILOVER_MODEL);
  });

  it('does not fire after a client abort', () => {
    expect(makePlan(anthropicRequest(), true).next(httpError(503))).toBeNull();
  });

  it('does not fire for a model with no OpenRouter route', () => {
    const attempt = makePlan(makeProcessed()).next(httpError(503));
    expect(attempt?.provider).not.toBe('openrouter');
  });

  it('does not fire when the request carries provider-native tool payloads', () => {
    const withNativeTools = anthropicRequest({
      fallbackModels: [],
      llmRequest: {
        model: ANTHROPIC_FAILOVER_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 100,
        tools: [{ type: 'web_search_20260209', name: 'web_search' }],
      } as unknown as ProcessedRequest['llmRequest'],
    });
    expect(makePlan(withNativeTools).next(httpError(503))).toBeNull();
  });

  it('still fires when the request carries ordinary function tools', () => {
    const withFunctionTools = anthropicRequest({
      fallbackModels: [],
      llmRequest: {
        model: ANTHROPIC_FAILOVER_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 100,
        tools: [{ type: 'function', function: { name: 'get_weather', parameters: {} } }],
      } as unknown as ProcessedRequest['llmRequest'],
    });
    expect(makePlan(withFunctionTools).next(httpError(503))?.provider).toBe('openrouter');
  });
});

describe('shared breakers consulted before dispatch', () => {
  function planWithBreakers(
    options: Partial<Parameters<typeof createFailoverPlan>[1]> = {},
  ): ReturnType<typeof createFailoverPlan> {
    return createFailoverPlan(makeProcessed(), {
      signal: new AbortController().signal,
      isProviderDispatchable: () => true,
      ...options,
    });
  }

  it('skips a candidate whose route breaker is open', () => {
    const attempt = planWithBreakers({
      isCandidateBreakerOpen: ({ modelKey }) => modelKey === 'candidate-a',
    }).next(httpError(503));

    expect(attempt?.model).toBe('candidate-b');
  });

  it('refuses to rotate when every candidate route is parked', () => {
    const attempt = planWithBreakers({ isCandidateBreakerOpen: () => true }).next(httpError(503));

    expect(attempt).toBeNull();
  });

  it('skips a provider whose credential the shared breaker already holds open', () => {
    const attempt = planWithBreakers({ openCredentialProviders: ['openai'] }).next(httpError(503));

    expect(attempt?.model).toBe('candidate-b');
  });

  it('reports a credential rejection so it outlives the request', () => {
    const rejected: string[] = [];
    planWithBreakers({ onCredentialRejected: (provider) => rejected.push(provider) }).next(
      httpError(401, 'authentication error (401)'),
    );

    expect(rejected).toEqual(['anthropic']);
  });

  it('never reports an unfunded credential as a rejection', () => {
    const rejected: string[] = [];
    planWithBreakers({ onCredentialRejected: (provider) => rejected.push(provider) }).next(
      Object.assign(new Error('Your credit balance is too low to access the API'), { status: 400 }),
    );

    expect(rejected).toEqual([]);
  });
});
