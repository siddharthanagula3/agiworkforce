import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDecisionEvaluator,
  isDecisionResult,
  type DecisionPolicy,
  type DecisionRequest,
  type DecisionScope,
} from '../semantic-decisions';
import { buildCandidateDecision, selectDecisionCandidate } from '../candidate-decisions';

const KIND = 'test_signals';
const policy: DecisionPolicy = {
  mode: 'enabled',
  model: 'test-version',
  timeoutMs: 50,
  maxRequestBytes: 10000,
  maxQuestions: 8,
  maxConcurrent: 1,
  sampleRate: 1,
};
const scope: DecisionScope = { trustMode: 'managed', providerAllowed: true, cohort: 0 };
const request: DecisionRequest = {
  state: 'synthetic',
  questions: {
    category: { kind: 'choice', instruction: 'Which?', options: { a: 'A', b: 'B' } },
    needed: { kind: 'boolean', instruction: 'Needed?' },
    level: { kind: 'score', instruction: 'Level?', levels: ['Low', 'High'] },
  },
};
const result = {
  model: policy.model,
  inputTokens: 10,
  outputTokens: 3,
  answers: {
    category: { kind: 'choice', value: 'a', confidence: 0.8, probabilities: { a: 0.9, b: 0.1 } },
    needed: { kind: 'boolean', probability: 0.1 },
    level: { kind: 'score', value: 0.2, confidence: 0.6, probabilities: { '0': 0.8, '1': 0.2 } },
  },
};

afterEach(() => vi.useRealTimers());

describe('semantic decision isolation', () => {
  it.each(['local', 'byok'] as const)('never invokes the provider for %s', async (trustMode) => {
    const evaluate = vi.fn();
    const run = createDecisionEvaluator({
      kind: KIND,
      provider: { evaluate },
      policy: () => policy,
    });
    expect(await run(request, { ...scope, trustMode })).toMatchObject({
      status: 'fallback',
      reason: 'policy',
    });
    expect(evaluate).not.toHaveBeenCalled();
  });
  it.each([
    [{ ...policy, mode: 'disabled' }, scope, 'disabled'],
    [policy, { ...scope, providerAllowed: false }, 'policy'],
    [{ ...policy, sampleRate: 0 }, scope, 'sampled_out'],
    [{ ...policy, timeoutMs: NaN }, scope, 'policy'],
    [{ ...policy, maxRequestBytes: 1 }, scope, 'invalid_request'],
  ] as const)('bypasses before transport for policy %#', async (configured, context, reason) => {
    const evaluate = vi.fn();
    const run = createDecisionEvaluator({
      kind: KIND,
      provider: { evaluate },
      policy: () => configured,
    });
    expect(await run(request, context)).toMatchObject({ status: 'fallback', reason });
    expect(evaluate).not.toHaveBeenCalled();
  });
  it('returns shadow observations without actionable acceptance and excludes state from telemetry', async () => {
    const observe = vi.fn();
    const run = createDecisionEvaluator({
      kind: KIND,
      provider: { evaluate: async () => result },
      policy: () => ({ ...policy, mode: 'shadow' }),
      observe,
    });
    expect(await run(request, scope)).toMatchObject({ status: 'shadow' });
    expect(observe.mock.calls[0]?.[0]).toMatchObject({ kind: KIND, status: 'shadow' });
    expect(JSON.stringify(observe.mock.calls)).not.toContain('synthetic');
    expect(JSON.stringify(observe.mock.calls)).not.toContain('answers');
  });
  it('contains provider and telemetry failures', async () => {
    const run = createDecisionEvaluator({
      kind: KIND,
      provider: {
        evaluate: async () => {
          throw new Error('secret');
        },
      },
      policy: () => policy,
      observe: () => {
        throw new Error('telemetry');
      },
    });
    expect(await run(request, scope)).toMatchObject({
      status: 'fallback',
      reason: 'provider_error',
    });
  });
  it('contains malformed runtime configuration and request shapes before transport', async () => {
    const evaluate = vi.fn();
    const run = createDecisionEvaluator({
      kind: KIND,
      provider: { evaluate },
      policy: () => policy,
    });
    expect(await run({ state: 'synthetic' } as DecisionRequest, scope)).toMatchObject({
      status: 'fallback',
      reason: 'invalid_request',
    });
    const misconfigured = createDecisionEvaluator({
      kind: KIND,
      provider: { evaluate },
      policy: () => ({ ...policy, model: null }) as unknown as DecisionPolicy,
    });
    expect(await misconfigured(request, scope)).toMatchObject({
      status: 'fallback',
      reason: 'policy',
    });
    expect(evaluate).not.toHaveBeenCalled();
  });
  it('honors pre-abort and cancels a running transport', async () => {
    const controller = new AbortController();
    let providerSignal: AbortSignal | undefined;
    const evaluate = vi.fn(async (_request, signal: AbortSignal) => {
      providerSignal = signal;
      return new Promise(() => {});
    });
    const run = createDecisionEvaluator({
      kind: KIND,
      provider: { evaluate },
      policy: () => policy,
    });
    const pending = run(request, { ...scope, signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    expect(await pending).toMatchObject({ reason: 'aborted' });
    expect(providerSignal?.aborted).toBe(true);
    expect(await run(request, { ...scope, signal: controller.signal })).toMatchObject({
      reason: 'aborted',
    });
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
  it('bounds waiting without freeing the capacity of a transport that ignores abort', async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    const evaluate = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const run = createDecisionEvaluator({
      kind: KIND,
      provider: { evaluate },
      policy: () => policy,
    });
    const pending = run(request, scope);
    await vi.advanceTimersByTimeAsync(51);
    expect(await pending).toMatchObject({ reason: 'timeout' });
    expect(await run(request, scope)).toMatchObject({ reason: 'capacity' });
    resolve(result);
    await Promise.resolve();
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
  it('discards a response after a kill switch changes', async () => {
    let current = policy;
    const run = createDecisionEvaluator({
      kind: KIND,
      provider: {
        evaluate: async () => {
          current = { ...policy, mode: 'disabled' };
          return result;
        },
      },
      policy: () => current,
    });
    expect(await run(request, scope)).toMatchObject({ reason: 'policy_changed' });
  });
});

describe('response validation', () => {
  it('accepts valid probabilities and fractional scores', () =>
    expect(isDecisionResult(result, request, policy.model)).toBe(true));
  it.each([
    { ...result, model: 'different-version' },
    { ...result, inputTokens: -1 },
    { ...result, answers: {} },
    { ...result, answers: { ...result.answers, extra: result.answers.needed } },
    { ...result, answers: { ...result.answers, needed: { kind: 'boolean', probability: NaN } } },
    {
      ...result,
      answers: { ...result.answers, category: { ...result.answers.category, value: 'b' } },
    },
    {
      ...result,
      answers: {
        ...result.answers,
        category: { ...result.answers.category, probabilities: { a: 0.9 } },
      },
    },
    { ...result, answers: { ...result.answers, level: { ...result.answers.level, value: 1 } } },
  ])('rejects malformed response %#', (invalid) =>
    expect(isDecisionResult(invalid, request, policy.model)).toBe(false),
  );
});

describe('candidate selection', () => {
  const candidates = [{ id: 'real-skill', description: 'Create a document' }];
  const req = buildCandidateDecision('Create a document', candidates);
  const accepted = {
    status: 'accepted' as const,
    latencyMs: 1,
    result: {
      model: policy.model,
      inputTokens: 1,
      outputTokens: 1,
      answers: {
        candidate: {
          kind: 'choice' as const,
          value: 'candidate_0',
          confidence: 0.9,
          probabilities: { none: 0.05, candidate_0: 0.95 },
        },
        fits_0: { kind: 'boolean' as const, probability: 0.9 },
      },
    },
  };
  it('asks ranking and absolute fit together without sending candidate identifiers', () => {
    expect(Object.keys(req.questions)).toEqual(['fits_0', 'candidate']);
    expect(JSON.stringify(req)).not.toContain('real-skill');
  });
  it('requires both confidence and absolute fit', () => {
    expect(
      selectDecisionCandidate(accepted, candidates, { confidence: 0.8, fitProbability: 0.8 }),
    ).toEqual({ status: 'selected', candidateId: 'real-skill' });
    expect(
      selectDecisionCandidate(accepted, candidates, { confidence: 0.8, fitProbability: 0.95 }),
    ).toMatchObject({ status: 'fallback' });
    expect(
      selectDecisionCandidate({ ...accepted, status: 'shadow' }, candidates, {
        confidence: 0,
        fitProbability: 0,
      }),
    ).toMatchObject({ status: 'fallback' });
  });
});

it('accepts independently rounded live scores without discarding their probabilities', () => {
  const request = {
    state: 'Solve the differential equation and justify each step.',
    questions: {
      complexity: {
        kind: 'score' as const,
        instruction: 'Complexity?',
        levels: ['Brief', 'Familiar', 'Dependent', 'Difficult'],
      },
    },
  };
  const response = {
    model: policy.model,
    inputTokens: 344,
    outputTokens: 19,
    answers: {
      complexity: {
        kind: 'score',
        value: 1.99,
        confidence: 0.84,
        probabilities: { '0': 0.01, '1': 0.08, '2': 0.84, '3': 0.07 },
      },
    },
  };
  expect(isDecisionResult(response, request, policy.model)).toBe(true);
  response.answers.complexity.value = 2.5;
  expect(isDecisionResult(response, request, policy.model)).toBe(false);
});
