// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  after: vi.fn((_task: unknown) => {}),
  evaluateSemanticDecision: vi.fn<
    (input: unknown) => Promise<import('../host').SemanticDecisionResult>
  >(async () => ({
    mode: 'disabled',
    outcome: { status: 'fallback', reason: 'disabled', latencyMs: 0 },
    model: null,
  })),
  persistSemanticDecisionTraces: vi.fn((_traces: unknown) => {}),
  recordSemanticDecisionComparison: vi.fn((_input: unknown) => {}),
  evaluateFlagsForSubject: vi.fn(async () => ({})),
  getActiveFlagDefinitions: vi.fn(async () => []),
}));

vi.mock('next/server', () => ({ after: (task: unknown) => mocks.after(task) }));

vi.mock('@/lib/feature-flags/flag-evaluation-service', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/feature-flags/flag-evaluation-service')
  >('@/lib/feature-flags/flag-evaluation-service');
  return { ...actual, evaluateFlagsForSubject: () => mocks.evaluateFlagsForSubject() };
});

vi.mock('@/lib/feature-flags/flag-store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/feature-flags/flag-store')>(
    '@/lib/feature-flags/flag-store',
  );
  return { ...actual, getActiveFlagDefinitions: () => mocks.getActiveFlagDefinitions() };
});

vi.mock('../host', async () => {
  const actual = await vi.importActual<typeof import('../host')>('../host');
  return {
    ...actual,
    evaluateSemanticDecision: (input: unknown) => mocks.evaluateSemanticDecision(input),
  };
});

vi.mock('../trace-service', async () => {
  const actual = await vi.importActual<typeof import('../trace-service')>('../trace-service');
  return {
    ...actual,
    persistSemanticDecisionTraces: (traces: unknown) => mocks.persistSemanticDecisionTraces(traces),
  };
});

vi.mock('@/lib/observability/metrics', async () => {
  const actual = await vi.importActual<typeof import('@/lib/observability/metrics')>(
    '@/lib/observability/metrics',
  );
  return {
    ...actual,
    recordSemanticDecisionComparison: (input: unknown) =>
      mocks.recordSemanticDecisionComparison(input),
  };
});

import { decisionFlagKey } from '@/lib/feature-flags/decision-flags';

import {
  runTurnSignalsShadow,
  scheduleTurnSignalsShadow,
  type TurnSignalsShadowInput,
  type TurnSignalsTurn,
} from '../turn-signals';

const SHADOW_FLAGS = {
  [decisionFlagKey('turn_signals')]: {
    key: decisionFlagKey('turn_signals'),
    variant: 'shadow',
    enabled: true,
    reason: 'default',
    ruleId: null,
    version: 1,
  },
};

function input(overrides: Partial<TurnSignalsTurn> = {}): TurnSignalsShadowInput {
  return {
    scope: {
      request: new Request('https://app.example/api/llm/v1/chat/completions'),
      requestId: 'request-1',
      userId: 'user-1',
      plan: 'pro',
      surface: 'web',
      privacyMode: 'managed',
      workspaceId: 'workspace-1',
      zeroDataRetentionOnly: false,
      workspaceModelPolicy: null,
      residencyRegion: null,
    },
    derive: () => ({
      modelSelection: 'auto',
      latestUserMessage: 'write me a script that renames these files',
      previousUserMessage: null,
      hasAttachments: false,
      baselineTaskFamily: 'general_chat',
      ...overrides,
    }),
  };
}

function shadowAnswers() {
  return {
    mode: 'shadow' as const,
    model: 'pinned-version',
    outcome: {
      status: 'shadow' as const,
      latencyMs: 190,
      result: {
        model: 'pinned-version',
        inputTokens: 240,
        outputTokens: 8,
        answers: {
          task_family: {
            kind: 'choice' as const,
            value: 'code_execution',
            confidence: 0.86,
            probabilities: { code_execution: 0.86, general_chat: 0.14 },
          },
          needs_current_information: { kind: 'boolean' as const, probability: 0.1 },
          needs_external_tools: { kind: 'boolean' as const, probability: 0.7 },
          needs_code_understanding: { kind: 'boolean' as const, probability: 0.95 },
          semantic_complexity: {
            kind: 'score' as const,
            value: 1.2,
            confidence: 0.6,
            probabilities: { '0': 0.1, '1': 0.6, '2': 0.3 },
          },
        },
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TYPESAFE_API_KEY', 'synthetic-test-key');
  vi.stubEnv('TYPESAFE_BASE_URL', 'https://api.typesafe.ai');
  vi.stubEnv('TYPESAFE_MODEL', 'pinned-version');
  vi.stubEnv('TYPESAFE_INPUT_MICROUSD_PER_MTOK', '42000');
  mocks.evaluateFlagsForSubject.mockResolvedValue(SHADOW_FLAGS);
  mocks.getActiveFlagDefinitions.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('scheduling the shadow', () => {
  it('hands the work to after rather than the response path', () => {
    scheduleTurnSignalsShadow(input());

    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.evaluateSemanticDecision).not.toHaveBeenCalled();
  });

  it('runs nothing at all when there is no request scope to hold open', () => {
    mocks.after.mockImplementationOnce(() => {
      throw new Error('after() was called outside a request scope');
    });

    expect(() => scheduleTurnSignalsShadow(input())).not.toThrow();
    expect(mocks.evaluateSemanticDecision).not.toHaveBeenCalled();
  });

  it('swallows a failure inside the deferred work rather than rejecting', async () => {
    mocks.after.mockImplementationOnce((task: unknown) => {
      void (task as () => Promise<void>)();
    });
    mocks.evaluateFlagsForSubject.mockRejectedValueOnce(new Error('flag store is gone'));

    expect(() => scheduleTurnSignalsShadow(input())).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});

describe('turns the deterministic path keeps for itself', () => {
  it.each([
    ['an attachment', { hasAttachments: true }, 'attachments_present'],
    ['a named model', { modelSelection: 'some-specific-model' }, 'explicit_model'],
    ['no text', { latestUserMessage: '   ' }, 'no_text'],
  ])('names %s as the reason rather than asking', async (_label, overrides, reason) => {
    await runTurnSignalsShadow(input(overrides as Partial<TurnSignalsTurn>));

    const [call] = mocks.evaluateSemanticDecision.mock.calls[0] as [
      { context: { precondition?: string } },
    ];
    expect(call.context.precondition).toBe(reason);
  });

  it('asks for an auto selection with plain text', async () => {
    await runTurnSignalsShadow(input());

    const [call] = mocks.evaluateSemanticDecision.mock.calls[0] as [
      { context: { precondition?: string } },
    ];
    expect(call.context.precondition).toBeUndefined();
  });
});

describe('what the shadow records', () => {
  it('records nothing, and derives nothing, when the kind is disabled', async () => {
    mocks.evaluateFlagsForSubject.mockResolvedValue({});
    const derive = vi.fn(() => ({
      modelSelection: 'auto',
      latestUserMessage: 'write me a script that renames these files',
      previousUserMessage: null,
      hasAttachments: false,
      baselineTaskFamily: 'general_chat' as const,
    }));

    await runTurnSignalsShadow({ ...input(), derive });

    expect(derive).not.toHaveBeenCalled();
    expect(mocks.evaluateSemanticDecision).not.toHaveBeenCalled();
    expect(mocks.persistSemanticDecisionTraces).not.toHaveBeenCalled();
    expect(mocks.recordSemanticDecisionComparison).not.toHaveBeenCalled();
  });

  it('compares the family against the classifier and keeps the rest as bins', async () => {
    mocks.evaluateSemanticDecision.mockResolvedValue(shadowAnswers());

    await runTurnSignalsShadow(input());

    const [traces] = mocks.persistSemanticDecisionTraces.mock.calls[0] as [
      Record<string, unknown>[],
    ];
    expect(traces.map((trace) => trace['questionKey'])).toEqual([
      'task_family',
      'needs_current_information',
      'needs_external_tools',
      'needs_code_understanding',
      'semantic_complexity',
    ]);
    expect(traces[0]).toMatchObject({
      mode: 'shadow',
      baselineValue: 'general_chat',
      candidateValue: 'code_execution',
      agree: false,
      confidenceBin: 'p80_100',
    });
    expect(traces[1]).toMatchObject({ candidateValue: null, probabilityBin: 'p00_20' });
    expect(traces[4]).toMatchObject({ candidateValue: 'level_1', confidenceBin: 'p60_80' });
    expect(mocks.recordSemanticDecisionComparison).toHaveBeenCalledWith({
      kind: 'turn_signals',
      question: 'task_family',
      agree: false,
      confidenceBin: 'p80_100',
    });
  });

  it('never writes the turn text, the state or an identifier', async () => {
    mocks.evaluateSemanticDecision.mockResolvedValue(shadowAnswers());

    await runTurnSignalsShadow(input());

    const written = JSON.stringify(mocks.persistSemanticDecisionTraces.mock.calls);
    expect(written).not.toContain('rename');
    expect(written).not.toContain('user-1');
    expect(written).not.toContain('workspace-1');
  });

  it('records the classifier answer and why no comparison happened on a fallback', async () => {
    mocks.evaluateSemanticDecision.mockResolvedValue({
      mode: 'shadow' as const,
      model: null,
      outcome: { status: 'fallback' as const, reason: 'timeout' as const, latencyMs: 2_000 },
    });

    await runTurnSignalsShadow(input());

    const [traces] = mocks.persistSemanticDecisionTraces.mock.calls[0] as [
      Record<string, unknown>[],
    ];
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      questionKey: 'task_family',
      baselineValue: 'general_chat',
      candidateValue: null,
      agree: null,
      fallbackReason: 'timeout',
    });
    expect(mocks.recordSemanticDecisionComparison).not.toHaveBeenCalled();
  });

  it('calls an abstaining classifier ambiguous rather than agreeing with nothing', async () => {
    mocks.evaluateSemanticDecision.mockResolvedValue(shadowAnswers());

    await runTurnSignalsShadow(input({ baselineTaskFamily: null }));

    const [traces] = mocks.persistSemanticDecisionTraces.mock.calls[0] as [
      Record<string, unknown>[],
    ];
    expect(traces[0]).toMatchObject({ baselineValue: 'ambiguous', agree: false });
  });

  it('marks the row served once a kind is switched past shadow', async () => {
    mocks.evaluateSemanticDecision.mockResolvedValue({ ...shadowAnswers(), mode: 'enabled' });

    await runTurnSignalsShadow(input());

    const [traces] = mocks.persistSemanticDecisionTraces.mock.calls[0] as [
      Record<string, unknown>[],
    ];
    expect(traces[0]).toMatchObject({ mode: 'served' });
  });
});
