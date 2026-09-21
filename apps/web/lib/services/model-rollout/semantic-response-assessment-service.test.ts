import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createMemoryKeyValueStore } from '@agiworkforce/key-value';
import type {
  VercelGatewayEvaluationRequest,
  VercelGatewayEvaluationResult,
} from '@agiworkforce/providers-vercel-gateway';
import type { ResponseBudgetPlan } from '@agiworkforce/routing';

import {
  assessSemanticResponseBudget,
  resetSemanticResponseAssessmentStateForTests,
  semanticResponseAssessmentSkipReason,
  type SemanticResponseAssessmentInput,
} from './semantic-response-assessment-service';

const DEFAULT_BUDGET: ResponseBudgetPlan = {
  depth: 'normal',
  format: 'mixed',
  outputTokenBudget: 2_048,
  explanationRequired: false,
  clarification: 'not_required',
  source: 'default',
  instruction: 'Answer.',
};

function input(
  overrides: Partial<SemanticResponseAssessmentInput> = {},
): SemanticResponseAssessmentInput {
  return {
    requestId: 'request-1',
    requestedModel: 'auto',
    surface: 'web',
    isFreePlan: false,
    hasMedia: false,
    initialBudget: DEFAULT_BUDGET,
    zeroDataRetentionOnly: false,
    residencyRegion: null,
    workspaceModelPolicy: null,
    enableResponseAssessment: true,
    applyResponseAssessment: true,
    message: 'Prepare the appropriate response for this request.',
    taskType: 'reasoning',
    userId: 'user-1',
    organizationId: null,
    promptVariants: {},
    ...overrides,
  };
}

function providerResult(confidence = 0.9) {
  return {
    model: 'test-evaluator',
    answers: {
      answer_depth: {
        type: 'choice' as const,
        choice: 'short',
        probabilities: {
          one_word: 0,
          one_sentence: 0,
          very_short: 0.05,
          short: confidence,
          normal: 0.05,
          detailed: 0,
          comprehensive: 0,
        },
      },
      answer_format: {
        type: 'choice' as const,
        choice: 'bullets',
        probabilities: {
          word: 0,
          sentence: 0,
          plain_text: 0.05,
          bullets: confidence,
          steps: 0.05,
          table: 0,
          code: 0,
          json: 0,
          markdown_document: 0,
          mixed: 0,
        },
      },
      explanation_required: { type: 'boolean' as const, probability: 0.1 },
      clarification: {
        type: 'choice' as const,
        choice: 'not_required',
        probabilities: { required: 0.05, not_required: confidence, uncertain: 0.05 },
      },
    },
    usage: { inputTokens: 150, outputTokens: 20 },
    resolvedProvider: 'test-provider',
    generationId: 'generation-1',
    providerCostMicrousd: 12,
  };
}

function dependencies(
  evaluate: (
    input: VercelGatewayEvaluationRequest,
  ) => Promise<VercelGatewayEvaluationResult> = vi.fn(async () => providerResult()),
) {
  return {
    now: () => Date.parse('2026-09-20T12:00:00Z'),
    getStore: () => createMemoryKeyValueStore(),
    getCredentials: () => ({ apiKey: 'test-key' }),
    createEvaluator: () => ({ evaluate }),
    recordCost: vi.fn(async () => undefined),
  };
}

beforeEach(() => resetSemanticResponseAssessmentStateForTests());

describe('semantic response assessment eligibility', () => {
  it.each([
    ['feature_disabled', { enableResponseAssessment: false }],
    ['manual_model', { requestedModel: 'manual-selection' }],
    ['surface_ineligible', { surface: 'api' }],
    ['free_plan', { isFreePlan: true }],
    ['media_turn', { hasMedia: true }],
    ['zero_data_retention_unverified', { zeroDataRetentionOnly: true }],
    ['residency_unverified', { residencyRegion: 'eu' }],
    ['deterministic_budget', { initialBudget: { ...DEFAULT_BUDGET, source: 'explicit' as const } }],
  ])('skips %s', (reason, overrides) => {
    expect(
      semanticResponseAssessmentSkipReason(
        input(overrides as Partial<SemanticResponseAssessmentInput>),
        Date.parse('2026-09-20T12:00:00Z'),
      ),
    ).toBe(reason);
  });
});

describe('semantic response assessment execution', () => {
  it('applies a confident active assessment and records exact cost', async () => {
    const deps = dependencies();
    const outcome = await assessSemanticResponseBudget(input(), deps);
    expect(outcome.assessment).toMatchObject({
      accepted: true,
      answerDepth: 'short',
      answerFormat: 'bullets',
      explanationRequired: false,
      clarification: 'not_required',
    });
    expect(outcome.trace).toMatchObject({
      mode: 'active',
      status: 'assessed',
      reason: 'accepted',
      providerCostMicrousd: 12,
    });
    expect(deps.recordCost).toHaveBeenCalledWith(
      expect.objectContaining({ providerReportedCostMicrousd: 12, customerCanonicalMicrousd: 0 }),
    );
  });

  it('observes in shadow without changing the response budget', async () => {
    const outcome = await assessSemanticResponseBudget(
      input({ applyResponseAssessment: false }),
      dependencies(),
    );
    expect(outcome.assessment).toMatchObject({ accepted: false });
    expect(outcome.trace).toMatchObject({ mode: 'shadow', reason: 'shadow_only', accepted: false });
  });

  it('preserves the baseline on low confidence', async () => {
    const evaluate = vi.fn(async () => providerResult(0.4));
    const outcome = await assessSemanticResponseBudget(input(), dependencies(evaluate));
    expect(outcome.assessment).toBeNull();
    expect(outcome.trace).toMatchObject({ reason: 'low_confidence', accepted: false });
  });

  it('deduplicates repeated processing of one request', async () => {
    const evaluate = vi.fn(async () => providerResult());
    const deps = dependencies(evaluate);
    const [first, second] = await Promise.all([
      assessSemanticResponseBudget(input(), deps),
      assessSemanticResponseBudget(input(), deps),
    ]);
    expect(evaluate).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
  });

  it('preserves the baseline when evaluation fails', async () => {
    const evaluate = vi.fn(async () => {
      throw new Error('provider failed');
    });
    const outcome = await assessSemanticResponseBudget(input(), dependencies(evaluate));
    expect(outcome.assessment).toBeNull();
    expect(outcome.trace).toMatchObject({ status: 'failed', reason: 'evaluation_failed' });
  });

  it('propagates cancellation instead of dispatching the baseline', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const evaluate = vi.fn(async ({ signal }: { signal?: AbortSignal }) => {
      throw signal?.reason;
    });
    await expect(
      assessSemanticResponseBudget(input({ signal: controller.signal }), dependencies(evaluate)),
    ).rejects.toThrow('cancelled');
  });

  it('bounds concurrent evaluations', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const evaluate = vi.fn(async () => {
      await gate;
      return providerResult();
    });
    const deps = dependencies(evaluate);
    const active = Array.from({ length: 16 }, (_, index) =>
      assessSemanticResponseBudget(input({ requestId: `request-${index}` }), deps),
    );
    const overflow = await assessSemanticResponseBudget(
      input({ requestId: 'request-overflow' }),
      deps,
    );
    expect(overflow.trace).toMatchObject({ status: 'skipped', reason: 'concurrency_limit' });
    release?.();
    await Promise.all(active);
    expect(evaluate).toHaveBeenCalledTimes(16);
  });
});
