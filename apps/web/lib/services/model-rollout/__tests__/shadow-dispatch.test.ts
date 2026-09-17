import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('next/server', () => ({ after: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  store: {
    get: vi.fn(async (_key: string) => null as number | null),
    increment: vi.fn(async (_key: string) => 1),
    expire: vi.fn(async (_key: string, _ttlSeconds: number) => undefined),
    set: vi.fn(async (_key: string, _value: unknown) => true),
  },
  stream: vi.fn((_request: unknown, _signal: AbortSignal) => undefined as unknown),
  drain: vi.fn(async (..._args: unknown[]) => ({}) as Record<string, unknown>),
  recordProviderCostEvent: vi.fn(async (_event: unknown) => undefined),
  recordShadowRouteOutcome: vi.fn(async (_routeId: string, _outcome: unknown) => undefined),
  recordRoutingDecision: vi.fn(async (_record: unknown) => undefined),
  completeRoutingDecision: vi.fn(async (_outcome: unknown) => undefined),
  calculateCost: vi.fn(
    (_provider: string, _model: string, _usage: unknown, _now?: Date, _routeId?: string) => 7,
  ),
}));

vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: () => mocks.store }));

vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-providers', () => ({
  resolveWireMode: () => 'legacy-web',
}));

vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', () => ({
  drainToLlmResponse: (...args: unknown[]) => mocks.drain(...args),
}));

vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildProtocolRouteAdapter: vi.fn(),
  buildServerProviderAdapter: () => ({
    stream: (request: unknown, signal: AbortSignal) => mocks.stream(request, signal),
  }),
  toGenericUpstreamError: (provider: string) => new Error(`upstream ${provider}`),
}));

vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordProviderCostEvent: (event: unknown) => mocks.recordProviderCostEvent(event),
}));

vi.mock('@/lib/services/free-lane/runtime-state-service', () => ({
  recordShadowRouteOutcome: (routeId: string, outcome: unknown) =>
    mocks.recordShadowRouteOutcome(routeId, outcome),
}));

vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateCost: (
      provider: string,
      model: string,
      usage: unknown,
      now?: Date,
      routeId?: string,
    ) => mocks.calculateCost(provider, model, usage, now, routeId),
  },
}));

vi.mock('../routing-decision-trace-service', () => ({
  recordRoutingDecision: (record: unknown) => mocks.recordRoutingDecision(record),
  completeRoutingDecision: (outcome: unknown) => mocks.completeRoutingDecision(outcome),
}));

import type { RoutingDecisionTrace, ShadowMirror } from '@agiworkforce/routing';

import { dispatchShadowRequest, type ShadowDispatchInput } from '../shadow-dispatch-service';

const SHADOW: ShadowMirror = {
  slotId: 'coding_balanced',
  modelKey: 'candidate-model',
  provider: 'openai',
  providerModelId: 'candidate-model',
  routeId: 'openai/candidate-model',
  harnessId: 'openai/responses',
  dailyRequestCap: 10,
};

const SERVED_TRACE = {
  schemaVersion: 1,
  requestId: 'request-1',
  selection: 'auto',
  taskType: 'coding',
  trustMode: 'managed_cloud',
  tier: 'pro',
  region: 'us',
  status: 'selected',
  code: null,
  reason: 'preferred_slot',
  modelKey: 'promoted-model',
  provider: 'anthropic',
  routeId: 'anthropic/promoted-model',
  slotId: 'coding_balanced',
  cohort: 'control',
  lifecycleStage: 'promoted',
  fallbacks: [],
  shadow: null,
  reasons: [],
  stages: { observedHealth: true, canary: true, shadow: true, taskFamily: true },
  inputs: {
    capabilitiesInUse: [],
    observedRouteCount: 0,
    unhonouredRouteCount: 0,
    unfundedRouteCount: 0,
    policyExcludedRouteCount: 0,
    preferredRouteId: null,
    currentModelKey: null,
    budgetConstrained: false,
    workspaceModelPolicy: false,
    zeroDataRetentionOnly: false,
    usOnly: false,
    excludedProviderCount: 0,
    excludedRouteHostCount: 0,
    canaryCohorts: {},
  },
  observed: { failureRate: null, latencyP50Ms: null },
} as unknown as RoutingDecisionTrace;

function input(): ShadowDispatchInput {
  return {
    shadow: SHADOW,
    servedTrace: SERVED_TRACE,
    requestId: 'request-1',
    userId: 'user_1',
    organizationId: null,
    surface: 'web',
    messages: [
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hello' },
      { role: 'tool', content: 'tool output' },
    ],
    maxTokens: 256,
    flagVariants: { 'routing.shadow': 'on' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.increment.mockResolvedValue(1);
  mocks.drain.mockResolvedValue({
    content: 'shadow answer',
    promptTokens: 40,
    completionTokens: 12,
    totalTokens: 52,
  });
});

describe('shadow dispatch', () => {
  it('mirrors the turn, meters it as platform cost and bills the user nothing', async () => {
    expect(await dispatchShadowRequest(input())).toBe('dispatched');

    expect(mocks.recordProviderCostEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        model: 'candidate-model',
        billedCents: 0,
        providerCostCents: 7,
        sourceRef: 'routing_shadow:request-1',
        routeId: 'openai/candidate-model',
      }),
    );
    expect(mocks.recordShadowRouteOutcome).toHaveBeenCalledWith(
      'openai/candidate-model',
      expect.objectContaining({ class: 'success' }),
    );
    expect(mocks.completeRoutingDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'shadow',
        outcome: 'succeeded',
        providerCostMicrousd: 70_000,
      }),
    );
  });

  it('records the mirror under the candidate, never as the served decision', async () => {
    await dispatchShadowRequest(input());
    const [record] = mocks.recordRoutingDecision.mock.calls[0] as unknown as [
      { kind: string; trace: RoutingDecisionTrace },
    ];
    expect(record.kind).toBe('shadow');
    expect(record.trace.modelKey).toBe('candidate-model');
    expect(record.trace.cohort).toBeNull();
    expect(record.trace.reason).toBe('shadow');
  });

  it('sends only the messages a provider can replay, dropping tool output', async () => {
    await dispatchShadowRequest(input());
    const [chatRequest] = mocks.stream.mock.calls[0] as unknown as [
      { messages: { role: string }[]; system?: unknown },
    ];
    expect(chatRequest.messages.map((message) => message.role)).toEqual(['user']);
    expect(JSON.stringify(chatRequest)).toContain('be brief');
    expect(JSON.stringify(chatRequest)).not.toContain('tool output');
  });

  it('stops at the slot daily cap', async () => {
    mocks.store.increment.mockResolvedValue(SHADOW.dailyRequestCap + 1);
    expect(await dispatchShadowRequest(input())).toBe('capped');
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.recordRoutingDecision).not.toHaveBeenCalled();
  });

  it('records a failed mirror without throwing at the caller', async () => {
    mocks.drain.mockRejectedValue(new Error('upstream exploded'));
    expect(await dispatchShadowRequest(input())).toBe('failed');
    expect(mocks.completeRoutingDecision).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'shadow', outcome: 'failed' }),
    );
    expect(mocks.recordProviderCostEvent).not.toHaveBeenCalled();
  });
});
