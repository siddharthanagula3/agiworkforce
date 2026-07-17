/**
 * Managed-failover plan semantics (AUTO-ROUTER-MIGRATION-01 web twin).
 * Mirrors the gateway's pinned semantics (services/api-gateway
 * __tests__/routes/llm-managed-failover.test.ts): rotation only on the five
 * availability categories, never on credential/rate-limit/abort classes,
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
    ['api_timeout', Object.assign(new Error('request timeout'), {})],
  ])('rotates on %s', (_label, error) => {
    const attempt = makePlan(makeProcessed()).next(error);
    expect(attempt).not.toBeNull();
    expect(attempt!.model).toBe('candidate-a');
  });

  it.each([
    ['credential failure (401)', httpError(401, 'authentication error (401)')],
    ['forbidden (403)', httpError(403, 'permission denied')],
    ['rate limit (429)', httpError(429, 'rate limit exceeded')],
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

  it('never rotates a request that carries tools (provider-native tool shapes do not transfer)', () => {
    const processed = makeProcessed();
    (processed.llmRequest as { tools?: unknown[] }).tools = [{ name: 'web_search' }];
    expect(makePlan(processed).next(httpError(503))).toBeNull();
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
});
