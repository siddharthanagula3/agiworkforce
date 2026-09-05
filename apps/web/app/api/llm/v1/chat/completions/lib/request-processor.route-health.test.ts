import { describe, expect, it, vi } from 'vitest';
import { emptyRuntimeState, type RouteHealthSnapshot } from '@agiworkforce/routing';
import { getModelsForProvider, requireProviderDefaultModel } from '@agiworkforce/types';
import { getRoutePricingForModel } from '@agiworkforce/model-registry';

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

import { resolveRouteHealthRuntimeState, resolveWebCloudModelRoute } from './request-processor';

const ANTHROPIC_DEFAULT_MODEL_ID = requireProviderDefaultModel('anthropic');
const anthropicPremiumModel = getModelsForProvider('anthropic').find(
  (model) =>
    model.reasoning?.thinkingDefault === 'adaptive' &&
    model.reasoning.rejectsSamplingParameters === true,
);
if (!anthropicPremiumModel) {
  throw new Error('The canonical Anthropic premium reasoning fixture must exist');
}

const MODEL = requireProviderDefaultModel('zhipu');
const modelRoutes = getRoutePricingForModel(MODEL);
const DEFAULT_ROUTE_ID = modelRoutes.find((route) => route.isDefault)!.routeId;
const NON_DEFAULT_SAME_MODEL_ROUTE_ID = modelRoutes.find((route) => !route.isDefault)!.routeId;
const OTHER_MODEL_ROUTE_ID = getRoutePricingForModel(anthropicPremiumModel.id).find(
  (route) => route.isDefault,
)!.routeId;

const anthropicDefaultRoutes = getRoutePricingForModel(ANTHROPIC_DEFAULT_MODEL_ID);
const SAME_MODEL_REGISTRY_ROUTE_ID = anthropicDefaultRoutes.find(
  (route) => route.isDefault,
)!.routeId;
const SAME_MODEL_REGISTRY_SIBLING_ROUTE_ID = anthropicDefaultRoutes.find(
  (route) => !route.isDefault,
)!.routeId;

const ZERO_COST_USAGE = { estimatedInputTokens: 0, estimatedOutputTokens: 0 };

function unavailableSnapshot(): RouteHealthSnapshot {
  return {
    available: false,
    halfOpen: false,
    consecutiveFailures: 5,
    sampleCount: 5,
    cooldownUntilMs: Date.now() + 60_000,
  };
}

describe('resolveWebCloudModelRoute · route health and warm-route affinity', () => {
  it('prefers the warm route over the naturally cheaper default when it is healthy', () => {
    const decision = resolveWebCloudModelRoute(
      MODEL,
      'pro',
      'general',
      ZERO_COST_USAGE,
      undefined,
      {
        runtimeState: emptyRuntimeState(Date.now()),
        preferredRouteId: NON_DEFAULT_SAME_MODEL_ROUTE_ID,
      },
    );

    expect(decision.status).toBe('selected');
    expect(decision.status === 'selected' && decision.routeId).toBe(
      NON_DEFAULT_SAME_MODEL_ROUTE_ID,
    );
  });

  it('loses affinity for a route the health snapshot reports in cooldown', () => {
    const nowMs = Date.now();
    const decision = resolveWebCloudModelRoute(
      MODEL,
      'pro',
      'general',
      ZERO_COST_USAGE,
      undefined,
      {
        runtimeState: {
          ...emptyRuntimeState(nowMs),
          routeHealthSnapshots: { [NON_DEFAULT_SAME_MODEL_ROUTE_ID]: unavailableSnapshot() },
        },
        preferredRouteId: NON_DEFAULT_SAME_MODEL_ROUTE_ID,
      },
    );

    expect(decision.status).toBe('selected');
    expect(decision.status === 'selected' && decision.routeId).toBe(DEFAULT_ROUTE_ID);
  });

  it('keeps an exact-model selection on its own model when the affinity names a different model', () => {
    const decision = resolveWebCloudModelRoute(
      MODEL,
      'pro',
      'general',
      ZERO_COST_USAGE,
      undefined,
      {
        runtimeState: emptyRuntimeState(Date.now()),
        preferredRouteId: OTHER_MODEL_ROUTE_ID,
      },
    );

    expect(decision.status).toBe('selected');
    expect(decision.status === 'selected' && decision.modelKey).toBe(MODEL);
    expect(decision.status === 'selected' && decision.routeId).toBe(DEFAULT_ROUTE_ID);
  });

  it('resolves exactly like an unknown conversation (no preference) when none is given', () => {
    const withoutAffinity = resolveWebCloudModelRoute(
      MODEL,
      'pro',
      'general',
      ZERO_COST_USAGE,
      undefined,
      { runtimeState: emptyRuntimeState(Date.now()) },
    );
    const withoutRouteHealthArg = resolveWebCloudModelRoute(
      MODEL,
      'pro',
      'general',
      ZERO_COST_USAGE,
    );

    expect(withoutAffinity.status === 'selected' && withoutAffinity.routeId).toBe(
      withoutRouteHealthArg.status === 'selected' && withoutRouteHealthArg.routeId,
    );
  });
});

describe('resolveRouteHealthRuntimeState · candidate route ids', () => {
  it('fetches health only for the exact model’s own routes', async () => {
    mockGetRouteHealthSnapshot.mockClear();
    await resolveRouteHealthRuntimeState(ANTHROPIC_DEFAULT_MODEL_ID, Date.now());

    const [routeIds] = mockGetRouteHealthSnapshot.mock.calls[0]!;
    expect(routeIds).toContain(SAME_MODEL_REGISTRY_ROUTE_ID);
    expect(routeIds).toContain(SAME_MODEL_REGISTRY_SIBLING_ROUTE_ID);
    expect(routeIds).not.toContain(OTHER_MODEL_ROUTE_ID);
  });

  it('fetches health across the whole Auto policy universe for an alias selection', async () => {
    mockGetRouteHealthSnapshot.mockClear();
    await resolveRouteHealthRuntimeState('auto', Date.now());

    const [routeIds] = mockGetRouteHealthSnapshot.mock.calls[0]!;
    expect((routeIds as readonly string[]).length).toBeGreaterThan(10);
    expect(routeIds).toContain(OTHER_MODEL_ROUTE_ID);
  });
});
