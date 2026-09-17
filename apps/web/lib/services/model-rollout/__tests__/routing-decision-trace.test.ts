import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  execute: vi.fn(async (_sql: string, _params?: unknown[]) => 1),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ execute: (sql: string, params?: unknown[]) => mocks.execute(sql, params) }),
}));

import type { RoutingDecisionTrace } from '@agiworkforce/routing';

import {
  persistRoutingDecision,
  persistRoutingDecisionOutcome,
} from '../routing-decision-trace-service';

const TRACE = {
  schemaVersion: 1,
  requestId: 'request-1',
  selection: 'auto',
  taskType: 'simple_chat',
  trustMode: 'managed_cloud',
  tier: 'pro',
  region: 'us',
  status: 'selected',
  code: null,
  reason: 'preferred_slot',
  modelKey: 'model-a',
  provider: 'openai',
  routeId: 'openai/model-a',
  slotId: 'general_fast',
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

function record(requestId: string) {
  return {
    trace: { ...TRACE, requestId },
    requestId,
    userId: 'user_1',
    organizationId: null,
    surface: 'web',
    kind: 'served' as const,
    flagVariants: {},
  };
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue(1);
});

describe('routing decision trace', () => {
  it('writes the decision with the cohort and slot a rollout is judged by', async () => {
    persistRoutingDecision(record('request-insert'));
    await settled();
    const [sql, params] = mocks.execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('insert into public.routing_decision_traces');
    expect(sql).toContain('on conflict (request_id, kind) do nothing');
    expect(params).toContain('general_fast');
    expect(params).toContain('control');
  });

  it('never completes a decision this process never recorded', async () => {
    persistRoutingDecisionOutcome({
      requestId: 'request-elsewhere',
      kind: 'served',
      outcome: 'succeeded',
    });
    await settled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('lets a later success overwrite the failure a retried step recorded', async () => {
    persistRoutingDecision(record('request-retry'));
    persistRoutingDecisionOutcome({
      requestId: 'request-retry',
      kind: 'served',
      outcome: 'failed',
      errorCode: 'server_error_500',
    });
    persistRoutingDecisionOutcome({
      requestId: 'request-retry',
      kind: 'served',
      outcome: 'succeeded',
      ttftMs: 420,
      durationMs: 3_000,
    });
    await settled();
    expect(mocks.execute).toHaveBeenCalledTimes(3);
    const [sql] = mocks.execute.mock.calls[2] as unknown as [string, unknown[]];
    expect(sql).toContain("outcome = 'failed' and $3 = 'succeeded'");
  });

  it('swallows a write failure rather than failing the turn', async () => {
    mocks.execute.mockRejectedValue(new Error('database down'));
    expect(() => persistRoutingDecision(record('request-broken'))).not.toThrow();
    await settled();
  });
});
