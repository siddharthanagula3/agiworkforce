// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  recordProviderCostEvent: vi.fn(async (_event: unknown) => {}),
  recordSemanticDecision: vi.fn((_input: unknown) => {}),
}));

vi.mock('@/lib/services/cogs-ledger-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/cogs-ledger-service')>(
    '@/lib/services/cogs-ledger-service',
  );
  return {
    ...actual,
    recordProviderCostEvent: (event: unknown) => mocks.recordProviderCostEvent(event),
  };
});

vi.mock('@/lib/observability/metrics', async () => {
  const actual = await vi.importActual<typeof import('@/lib/observability/metrics')>(
    '@/lib/observability/metrics',
  );
  return {
    ...actual,
    recordSemanticDecision: (input: unknown) => mocks.recordSemanticDecision(input),
  };
});

import type { DecisionRequest } from '@agiworkforce/agent-core';

import { decisionFlagKey } from '@/lib/feature-flags/decision-flags';
import type { FlagEvaluation } from '@/lib/feature-flags/evaluate-flags';

import {
  evaluateSemanticDecision,
  openDecisionGate,
  resetSemanticDecisionHost,
  type DecisionGate,
  type SemanticDecisionContext,
} from '../host';
import { readDecisionTransportConfig } from '../config';
import type { DecisionEligibilityFacts } from '../eligibility';
import { resolveDecisionMode, type DecisionModeResolution } from '../policy';

const KIND = 'turn_signals';
const KEY = decisionFlagKey(KIND);
const MODEL = 'pinned-version';
const BASE_URL = 'https://api.typesafe.ai';

const REQUEST: DecisionRequest = {
  state: 'synthetic turn text',
  questions: { needed: { kind: 'boolean', instruction: 'Needed?' } },
};

const ELIGIBLE: DecisionEligibilityFacts = {
  privacyMode: 'managed',
  workspaceId: 'workspace-1',
  zeroDataRetentionOnly: false,
  workspaceModelPolicy: null,
  residencyRegion: null,
};

function shadowFlag(): Record<string, FlagEvaluation> {
  return {
    [KEY]: {
      key: KEY,
      variant: 'shadow',
      enabled: true,
      reason: 'default',
      ruleId: null,
      version: 1,
    },
  };
}

const NOW_MS = Date.parse('2026-09-20T12:00:00.000Z');

function context(overrides: Partial<SemanticDecisionContext> = {}): SemanticDecisionContext {
  return {
    requestId: 'request-1',
    decisionId: 'turn_signals:request-1',
    userId: 'user-1',
    organizationId: 'workspace-1',
    surface: 'web',
    ...overrides,
  };
}

function resolution(
  evaluations: Record<string, FlagEvaluation> = shadowFlag(),
): DecisionModeResolution {
  return resolveDecisionMode({
    kind: KIND,
    evaluations,
    definitions: [],
    bucketId: 'user-1',
    nowMs: NOW_MS,
  });
}

function gate(
  overrides: {
    evaluations?: Record<string, FlagEvaluation>;
    eligibility?: DecisionEligibilityFacts;
  } = {},
): DecisionGate {
  return openDecisionGate({
    kind: KIND,
    transport: readDecisionTransportConfig(),
    resolution: resolution(overrides.evaluations),
    eligibility: overrides.eligibility ?? ELIGIBLE,
  });
}

function openGate(): Extract<DecisionGate, { asks: true }> {
  const resolved = gate();
  if (!resolved.asks) throw new Error('the gate was expected to open');
  return resolved;
}

function answerBody(model = MODEL) {
  return JSON.stringify({
    model,
    usage: { input_tokens: 100, output_tokens: 4 },
    answers: { needed: { type: 'noul', noul: 0.8 } },
  });
}

function respondWith(body: string, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(body, { status, headers: { 'Content-Type': 'application/json' } }),
    ),
  );
}

function run(overrides: Partial<SemanticDecisionContext> = {}) {
  return evaluateSemanticDecision({
    kind: KIND,
    request: REQUEST,
    gate: openGate(),
    context: context(overrides),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSemanticDecisionHost();
  vi.stubEnv('TYPESAFE_API_KEY', 'synthetic-test-key');
  vi.stubEnv('TYPESAFE_BASE_URL', BASE_URL);
  vi.stubEnv('TYPESAFE_MODEL', MODEL);
  vi.stubEnv('TYPESAFE_INPUT_MICROUSD_PER_MTOK', '42000');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('nothing happens until it is switched on', () => {
  it('records nothing at all when no flag exists', () => {
    const closed = gate({ evaluations: {} });

    expect(closed).toMatchObject({ asks: false, mode: 'disabled', skipReason: null });
    expect(mocks.recordSemanticDecision).not.toHaveBeenCalled();
  });

  it('reports itself disabled when the transport is unconfigured, whatever the flag says', () => {
    vi.stubEnv('TYPESAFE_API_KEY', '');

    expect(gate()).toMatchObject({ asks: false, mode: 'disabled', skipReason: 'unconfigured' });
    expect(mocks.recordSemanticDecision).not.toHaveBeenCalled();
  });

  it('never opens for a session that is not managed', () => {
    const closed = gate({ eligibility: { ...ELIGIBLE, privacyMode: 'byok' } });

    expect(closed).toMatchObject({ asks: false, skipReason: 'trust_mode' });
    expect(mocks.recordSemanticDecision).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'skipped', reason: 'trust_mode' }),
    );
    expect(mocks.recordProviderCostEvent).not.toHaveBeenCalled();
  });

  it('never opens for a subject the rollout did not draw', () => {
    const drawn = resolution();
    const closed = openDecisionGate({
      kind: KIND,
      transport: readDecisionTransportConfig(),
      resolution: { ...drawn, sampleRate: 0 },
      eligibility: ELIGIBLE,
    });

    expect(closed).toMatchObject({ asks: false, mode: 'shadow' });
    expect(mocks.recordSemanticDecision).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'fallback', reason: 'sampled_out' }),
    );
  });

  it('carries the pinned model and the subject the flag drew once it opens', () => {
    expect(openGate()).toMatchObject({
      asks: true,
      mode: 'shadow',
      trustMode: 'managed',
      policy: expect.objectContaining({ mode: 'shadow', model: MODEL, sampleRate: 1 }),
    });
  });

  it('never reaches the transport when the caller names a precondition', async () => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);

    expect(await run({ precondition: 'attachments_present' })).toMatchObject({
      skipReason: 'attachments_present',
    });
    expect(network).not.toHaveBeenCalled();
  });
});

describe('a decision that runs', () => {
  it('returns a shadow outcome and meters it once at no charge to the user', async () => {
    respondWith(answerBody());

    const result = await run();

    expect(result.outcome.status).toBe('shadow');
    expect(mocks.recordProviderCostEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordProviderCostEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: 'decision',
        provider: 'typesafe',
        billedCents: 0,
        unitBasis: 'token',
        units: 100,
        sourceRef: 'turn_signals:request-1',
        model: MODEL,
      }),
    );
    const [event] = mocks.recordProviderCostEvent.mock.calls[0] as [Record<string, unknown>];
    expect(event['customerCanonicalMicrousd']).toBeUndefined();
    expect(event['customerCanonicalCents']).toBeUndefined();
  });

  it('counts the decision without putting the turn text on a label', () => {
    respondWith(answerBody());

    return run().then(() => {
      expect(mocks.recordSemanticDecision).toHaveBeenCalledWith(
        expect.objectContaining({ kind: KIND, mode: 'shadow', outcome: 'shadow' }),
      );
      expect(JSON.stringify(mocks.recordSemanticDecision.mock.calls)).not.toContain('synthetic');
    });
  });
});

describe('a decision that does not land', () => {
  it.each([
    [
      'a provider error',
      () => respondWith('{"error":{"message":"private"}}', 500),
      'provider_error',
    ],
    [
      'a response for another model version',
      () => respondWith(answerBody('some-other-version')),
      'invalid_response',
    ],
    ['a response that is not JSON', () => respondWith('not json at all'), 'provider_error'],
  ])('falls back on %s without throwing', async (_label, arrange, reason) => {
    arrange();

    const result = await run();

    expect(result.outcome).toMatchObject({ status: 'fallback', reason });
    expect(mocks.recordProviderCostEvent).not.toHaveBeenCalled();
  });

  it('bounds the wait and refuses further work while the slot is held', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Promise<Response>(() => {})),
    );

    const held = Array.from({ length: 4 }, (_, index) =>
      run({ requestId: `held-${index}`, decisionId: `turn_signals:held-${index}` }),
    );
    await Promise.resolve();
    const overflow = run({ requestId: 'overflow', decisionId: 'turn_signals:overflow' });

    expect((await overflow).outcome).toMatchObject({ status: 'fallback', reason: 'capacity' });
    await vi.advanceTimersByTimeAsync(3_000);
    for (const pending of held) {
      expect((await pending).outcome).toMatchObject({ status: 'fallback', reason: 'timeout' });
    }
  });

  it('never throws into the caller, whatever the network does', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket hang up');
      }),
    );

    await expect(run()).resolves.toMatchObject({ outcome: { status: 'fallback' } });
  });
});

describe('two subjects in flight at once', () => {
  it('gives each its own policy instead of the one that resumed last', async () => {
    let release: ((value: Response) => void) | undefined;
    const slow = new Promise<Response>((resolve) => {
      release = resolve;
    });
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        return call === 1
          ? slow
          : new Response(answerBody(), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
      }),
    );

    const enabled = gate({
      evaluations: {
        [KEY]: {
          key: KEY,
          variant: 'enabled',
          enabled: true,
          reason: 'default',
          ruleId: null,
          version: 1,
        },
      },
    });
    if (!enabled.asks) throw new Error('the gate was expected to open');

    const first = run({ requestId: 'first', decisionId: 'turn_signals:first' });
    await Promise.resolve();
    const second = await evaluateSemanticDecision({
      kind: KIND,
      request: REQUEST,
      gate: enabled,
      context: context({ requestId: 'second', decisionId: 'turn_signals:second' }),
    });
    release?.(
      new Response(answerBody(), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    expect(second).toMatchObject({ mode: 'enabled', outcome: { status: 'accepted' } });
    expect(await first).toMatchObject({ mode: 'shadow', outcome: { status: 'shadow' } });
  });
});
