import { describe, expect, it, vi } from 'vitest';
import {
  emptyRuntimeState,
  type RouteHealthSnapshot,
  type RoutingRuntimeState,
} from '@agiworkforce/routing';
import { getRoutingSlotModel } from '@agiworkforce/types';

const mockGetRouteHealthSnapshot = vi.fn(async (routeIds: readonly string[], _nowMs: number) => {
  const snapshots: Record<string, RouteHealthSnapshot> = {};
  for (const routeId of routeIds) {
    snapshots[routeId] = {
      available: true,
      halfOpen: false,
      consecutiveFailures: 0,
      sampleCount: 0,
    };
  }
  return snapshots;
});
vi.mock('@/lib/services/free-lane/runtime-state-service', () => ({
  getRouteHealthSnapshot: (routeIds: readonly string[], nowMs: number) =>
    mockGetRouteHealthSnapshot(routeIds, nowMs),
  getServedRouteAffinity: vi.fn(async () => null),
  getFreeLaneRuntimeState: vi.fn(async () => ({})),
}));

import { resolveWebCloudModelRoute } from './request-processor';

const AUTO_ALIAS = 'auto';
const PAID_TIER = 'pro';
const CODING_TASK = 'coding';
const ZERO_COST_USAGE = { estimatedInputTokens: 0, estimatedOutputTokens: 0 };
const NOW_MS = Date.now();

const CODING_BALANCED_MODEL_ID = getRoutingSlotModel('coding_balanced');
const ESCALATION_CODING_MODEL_ID = getRoutingSlotModel('escalation_coding');
const WORKHORSE_MODEL_ID = getRoutingSlotModel('workhorse_general');

function selected(decision: ReturnType<typeof resolveWebCloudModelRoute>) {
  if (decision.status !== 'selected') {
    throw new Error(`expected a selection, got ${decision.status}`);
  }
  return decision;
}

function unhealthyRuntimeState(routeId: string): RoutingRuntimeState {
  return {
    ...emptyRuntimeState(NOW_MS),
    routeHealth: { [routeId]: { available: false, reason: 'provider_unhealthy' } },
  };
}

describe('resolveWebCloudModelRoute · Auto model continuity across turns', () => {
  it('keeps the second turn on the first turn model when nothing failed', () => {
    const turnOne = selected(
      resolveWebCloudModelRoute(AUTO_ALIAS, PAID_TIER, CODING_TASK, ZERO_COST_USAGE, undefined, {
        runtimeState: emptyRuntimeState(NOW_MS),
      }),
    );
    expect(turnOne.modelKey).toBe(CODING_BALANCED_MODEL_ID);

    const turnTwo = selected(
      resolveWebCloudModelRoute(AUTO_ALIAS, PAID_TIER, CODING_TASK, ZERO_COST_USAGE, undefined, {
        runtimeState: emptyRuntimeState(NOW_MS),
        currentModelKey: turnOne.modelKey,
        previousTaskType: CODING_TASK,
      }),
    );

    expect(turnTwo.modelKey).toBe(turnOne.modelKey);
    expect(turnTwo.reason).toBe('continuity');
  });

  it('moves exactly one rung up the ladder when the pinned model reports a failure, never sideways or down', () => {
    const turnOne = selected(
      resolveWebCloudModelRoute(AUTO_ALIAS, PAID_TIER, CODING_TASK, ZERO_COST_USAGE, undefined, {
        runtimeState: emptyRuntimeState(NOW_MS),
      }),
    );
    expect(turnOne.modelKey).toBe(CODING_BALANCED_MODEL_ID);

    const turnTwo = selected(
      resolveWebCloudModelRoute(AUTO_ALIAS, PAID_TIER, CODING_TASK, ZERO_COST_USAGE, undefined, {
        runtimeState: unhealthyRuntimeState(turnOne.routeId),
        currentModelKey: turnOne.modelKey,
        previousTaskType: CODING_TASK,
      }),
    );

    expect(turnTwo.reason).not.toBe('continuity');
    expect(turnTwo.modelKey).not.toBe(turnOne.modelKey);
    expect(turnTwo.modelKey).toBe(ESCALATION_CODING_MODEL_ID);
    expect(turnTwo.modelKey).not.toBe(WORKHORSE_MODEL_ID);
  });
});
