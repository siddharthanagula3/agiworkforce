import { describe, expect, it, vi } from 'vitest';
import { emptyRuntimeState, type RouteHealthSnapshot } from '@agiworkforce/routing';
import {
  getModelsForProvider,
  listCanonicalModels,
  requireProviderDefaultModel,
} from '@agiworkforce/types';
import { getRoutePricingForModel, modelRegistry } from '@agiworkforce/model-registry';
import { isNonUsVendorTransport } from '@agiworkforce/compliance';

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
const ROUTE_ID_SEPARATOR = '/';
const mockGetCredentialCooldownSnapshot = vi.fn(
  async (_credentialIds: readonly string[], _nowMs: number) =>
    ({}) as Record<string, RouteHealthSnapshot>,
);
vi.mock('@/lib/services/free-lane/runtime-state-service', () => ({
  getRouteHealthSnapshot: (routeIds: readonly string[], nowMs: number) =>
    mockGetRouteHealthSnapshot(routeIds, nowMs),
  getCredentialCooldownSnapshot: (credentialIds: readonly string[], nowMs: number) =>
    mockGetCredentialCooldownSnapshot(credentialIds, nowMs),
  providerOfRouteId: (routeId: string) => routeId.split(ROUTE_ID_SEPARATOR)[0],
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

const MANAGED_TRUST_MODE = 'managed_cloud';
const SERVABLE_COMMERCIAL_STATUSES: ReadonlySet<string> = new Set([
  'agi_direct',
  'authorized_marketplace',
  'free_commercial',
]);
const ZERO_COST_USAGE = { estimatedInputTokens: 0, estimatedOutputTokens: 0 };

function managedServableRouteIds(modelKey: string): string[] {
  return Object.entries(modelRegistry.routes)
    .filter(
      ([, route]) =>
        route.modelKey === modelKey &&
        route.trustModes.includes(MANAGED_TRUST_MODE) &&
        SERVABLE_COMMERCIAL_STATUSES.has(route.commercialStatus) &&
        !isNonUsVendorTransport(route.provider),
    )
    .map(([routeId]) => routeId);
}

function selectedRouteId(modelKey: string, preferredRouteId?: string): string | null {
  const decision = resolveWebCloudModelRoute(
    modelKey,
    'pro',
    'general',
    ZERO_COST_USAGE,
    undefined,
    {
      runtimeState: emptyRuntimeState(Date.now()),
      ...(preferredRouteId ? { preferredRouteId } : {}),
    },
  );
  return decision.status === 'selected' ? decision.routeId : null;
}

interface AffinityFixture {
  model: string;
  defaultRouteId: string;
  warmRouteId: string;
}

function findAffinityFixture(): AffinityFixture | null {
  const candidates = [
    requireProviderDefaultModel('zhipu'),
    ...listCanonicalModels().map((model) => model.id),
  ];
  for (const model of candidates) {
    const servable = managedServableRouteIds(model);
    if (servable.length < 2) continue;
    const defaultRouteId = selectedRouteId(model);
    if (!defaultRouteId) continue;
    const warmRouteId = servable.find(
      (routeId) => routeId !== defaultRouteId && selectedRouteId(model, routeId) === routeId,
    );
    if (warmRouteId) return { model, defaultRouteId, warmRouteId };
  }
  return null;
}

const affinityFixture = findAffinityFixture();
const MODEL = affinityFixture?.model ?? '';
const DEFAULT_ROUTE_ID = affinityFixture?.defaultRouteId ?? '';
const NON_DEFAULT_SAME_MODEL_ROUTE_ID = affinityFixture?.warmRouteId ?? '';
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

function unavailableSnapshot(): RouteHealthSnapshot {
  return {
    available: false,
    halfOpen: false,
    consecutiveFailures: 5,
    sampleCount: 5,
    cooldownUntilMs: Date.now() + 60_000,
  };
}

// llm-guardrail-allow: registry-derived fixture, needs two managed routes off excluded transports, D-2026-09-10-01
describe.skipIf(!affinityFixture)(
  'resolveWebCloudModelRoute · route health and warm-route affinity (needs a model with two managed routes off excluded transports)',
  () => {
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
  },
);

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

  it('reads the credential scope once per candidate provider, not once per route', async () => {
    mockGetCredentialCooldownSnapshot.mockClear();
    await resolveRouteHealthRuntimeState(ANTHROPIC_DEFAULT_MODEL_ID, Date.now());

    const [credentialIds] = mockGetCredentialCooldownSnapshot.mock.calls[0]!;
    const providers = credentialIds as readonly string[];
    expect(providers.length).toBe(new Set(providers).size);
    expect(providers).toContain(SAME_MODEL_REGISTRY_ROUTE_ID.split(ROUTE_ID_SEPARATOR)[0]);
  });

  it('reports every route on an unfunded credential, so the resolver can park them', async () => {
    const unfundedProvider = SAME_MODEL_REGISTRY_ROUTE_ID.split(ROUTE_ID_SEPARATOR)[0]!;
    mockGetCredentialCooldownSnapshot.mockResolvedValueOnce({
      [unfundedProvider]: {
        available: true,
        halfOpen: false,
        consecutiveFailures: 1,
        sampleCount: 1,
        unfunded: true,
      },
    });

    const resolved = await resolveRouteHealthRuntimeState(ANTHROPIC_DEFAULT_MODEL_ID, Date.now());

    // `available: true` on purpose: the cooldown has elapsed, so the breaker
    // would let this route through. Being out of money is the separate fact.
    expect(resolved.unfundedRouteIds.has(SAME_MODEL_REGISTRY_ROUTE_ID)).toBe(true);
    expect(resolved.unfundedRouteIds.has(SAME_MODEL_REGISTRY_SIBLING_ROUTE_ID)).toBe(
      SAME_MODEL_REGISTRY_SIBLING_ROUTE_ID.startsWith(unfundedProvider + ROUTE_ID_SEPARATOR),
    );
  });

  it('reports nothing unfunded when no credential says so', async () => {
    const resolved = await resolveRouteHealthRuntimeState(ANTHROPIC_DEFAULT_MODEL_ID, Date.now());

    expect(resolved.unfundedRouteIds.size).toBe(0);
  });
});
