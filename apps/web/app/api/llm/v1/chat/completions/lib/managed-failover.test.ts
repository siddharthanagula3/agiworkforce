/**
 * Managed-failover plan semantics (AUTO-ROUTER-MIGRATION-01 web twin).
 * Mirrors the gateway's pinned semantics (services/api-gateway
 * __tests__/routes/llm-managed-failover.test.ts): rotation only on the five
 * availability categories and direct-provider rate limits, plus credential
 * rejections — which condemn the ONE rejected provider account and skip its
 * remaining routes — never on abort/client-error classes,
 * per-attempt tier re-admission, structural rotation-freedom for explicit
 * selections (empty plan), and a derived attempt view that keeps ONE
 * reservation while attributing the serving model.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

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

// request-processor pulls in the full processing stack; the failover module
// only needs its two pure helpers. Stub them with behavior-faithful
// signatures so this stays a unit test of plan semantics.
vi.mock('./request-processor', () => ({
  resolveRequestEffort: vi.fn(() => undefined),
  buildThinkingConfig: vi.fn(() => undefined),
}));

import { createFailoverPlan, buildFailoverAttemptView } from './managed-failover';
import type { ProcessedRequest } from './request-processor';

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
    ['api_timeout', Object.assign(new Error('request timeout'), {})],
    // A rejected managed key condemns ONE provider account, not the request:
    // the remaining plan routes hold distinct keys and must still be tried.
    ['credential failure (401)', httpError(401, 'authentication error (401)')],
    ['forbidden (403)', httpError(403, 'permission denied')],
    ['revoked oauth token', new Error('This oauth token has been revoked')],
    ['disabled organization', httpError(403, 'Your organization has been disabled')],
    ['exhausted credit balance', new Error('Your credit balance is too low')],
  ])('rotates on %s', (_label, error) => {
    const attempt = makePlan(makeProcessed()).next(error);
    expect(attempt).not.toBeNull();
    expect(attempt!.model).toBe('candidate-a');
  });

  it('skips the rejected provider’s own remaining routes rather than replaying the same key', () => {
    // candidate-a is on the primary's provider (anthropic) — the same rejected
    // key — so it must be skipped; candidate-b (google) serves.
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
    // openai's 503 is an availability failure: its later plan routes stay
    // admissible, unlike a rejected credential.
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

  it('does not rotate a tool-bearing request across providers', () => {
    const processed = makeProcessed();
    (processed.llmRequest as { tools?: unknown[] }).tools = [{ name: 'web_search' }];
    expect(makePlan(processed).next(httpError(503))).toBeNull();
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
    // One reservation spans attempts: the exact same object, not a copy —
    // finalize/settle paths key off it, so a second reservation can never
    // be created by rotation.
    expect(view.managedUsage).toBe(processed.managedUsage);
    expect(view.requestId).toBe(processed.requestId);
    // The primary is untouched (a failed attempt must not mutate it).
    expect(processed.chatRequest.model).toBe('primary-model');
    expect(processed.usedFallback).toBe(false);
  });

  /**
   * CPST Stage-0 telemetry (managed cloud only,
   * docs/design/execution-plan-contract-and-cpst-2026-08-05.md §4.2). This is
   * the only place an additional provider attempt is created inside one billed
   * request, so it is the only honest source of the `retries` counter.
   */
  it('counts each rotation as one retry and leaves the un-rotated request unknown', () => {
    const processed = makeProcessed();
    expect(processed.retries).toBeUndefined();

    const first = buildFailoverAttemptView(processed, 'candidate-a', 'openai');
    expect(first.retries).toBe(1);

    const second = buildFailoverAttemptView(first, 'candidate-b', 'openai');
    expect(second.retries).toBe(2);

    // The primary view is never mutated, so a request that never rotated keeps
    // reporting the counter as absent (unknown), not as zero.
    expect(processed.retries).toBeUndefined();
    expect(first.retries).toBe(1);
  });

  it('increments retries across successive plan rotations (production call shape)', () => {
    // Regression: the plan previously built every attempt from the ORIGINAL
    // request view, so `retries` evaluated to 1 on every rotation. This test
    // rotates through the plan the way route.ts actually does.
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

/**
 * Route-level failover: retry the SAME model through OpenRouter before
 * changing model at all.
 *
 * Model rotation answers an outage with a different model, which is why it is
 * withheld from explicit selections. Retrying the identical model on another
 * wire has no such cost, so it is allowed where rotation is not — including
 * for explicit selections and empty fallback plans.
 */
describe('OpenRouter route failover', () => {
  const savedKey = process.env['OPENROUTER_API_KEY'];

  beforeEach(() => {
    process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env['OPENROUTER_API_KEY'];
    else process.env['OPENROUTER_API_KEY'] = savedKey;
  });

  /** A real catalog model, so it has a genuine OpenRouter failover slug. */
  function anthropicRequest(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
    return makeProcessed({
      provider: 'anthropic',
      chatRequest: {
        model: 'claude-sonnet-5',
        messages: [{ role: 'user', content: 'hi' }],
      } as unknown as ProcessedRequest['chatRequest'],
      llmRequest: {
        model: 'claude-sonnet-5',
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
    // The user asked for Haiku and still gets Haiku — that is the whole point.
    expect(attempt!.model).toBe('claude-sonnet-5');
    expect(attempt!.processed.fallbackReason).toBe('openrouter_route_failover');
  });

  it('works for an explicit selection, which model rotation cannot serve', () => {
    // Empty plan = explicit selection. Rotation is structurally unavailable
    // here; a route retry is not, because the answer is unchanged.
    const attempt = makePlan(anthropicRequest({ fallbackModels: [] })).next(httpError(503));
    expect(attempt?.provider).toBe('openrouter');
    expect(attempt?.model).toBe('claude-sonnet-5');
  });

  it('is attempted at most once, then falls through to model rotation', () => {
    const plan = makePlan(anthropicRequest());
    expect(plan.next(httpError(503))?.provider).toBe('openrouter');
    // A second availability failure must not loop back to OpenRouter.
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
    expect(attempt?.model).toBe('claude-sonnet-5');
  });

  it('does not fire after a client abort', () => {
    expect(makePlan(anthropicRequest(), true).next(httpError(503))).toBeNull();
  });

  it('does not fire for a model with no OpenRouter route', () => {
    // `primary-model` is not in the catalog, so no slug exists. It must fall
    // through to rotation rather than be sent to OpenRouter under a made-up id.
    const attempt = makePlan(makeProcessed()).next(httpError(503));
    expect(attempt?.provider).not.toBe('openrouter');
  });

  it('does not fire when the request carries provider-native tool payloads', () => {
    // Anthropic's server-side tools are vendor-wire-specific and unverified
    // through the proxy; ordinary function tools are fine because the model on
    // the far side is identical.
    const withNativeTools = anthropicRequest({
      fallbackModels: [],
      llmRequest: {
        model: 'claude-sonnet-5',
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
        model: 'claude-sonnet-5',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 100,
        tools: [{ type: 'function', function: { name: 'get_weather', parameters: {} } }],
      } as unknown as ProcessedRequest['llmRequest'],
    });
    expect(makePlan(withFunctionTools).next(httpError(503))?.provider).toBe('openrouter');
  });
});
