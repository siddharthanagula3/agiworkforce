/**
 * Ranked route selection over the several priced routes of ONE canonical model.
 *
 * The cases that use the real compiled registry pin the behaviour a downstream
 * caller sees today. The cases that mock the registry cover the admission and
 * cost rules no live route exercises yet — a blocked route, an experimental
 * route reached by managed traffic, and a warm route priced past the ceiling —
 * because seeding any of those into the catalog would make the catalog lie.
 */
import { modelRegistry } from '@agiworkforce/model-registry';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveAutoRoute, type RoutingRegistryView } from '../auto';
import type { RoutingRuntimeState } from '../runtime-state';

interface RouteView {
  modelKey: string;
  provider: string;
  isDefault: boolean;
}

const routes = modelRegistry.routes as unknown as Record<string, RouteView>;

const MULTI_ROUTE_MODEL_KEY = (() => {
  const counts = new Map<string, number>();
  for (const route of Object.values(routes)) {
    counts.set(route.modelKey, (counts.get(route.modelKey) ?? 0) + 1);
  }
  const found = [...counts.entries()].find(([, count]) => count > 1)?.[0];
  if (!found) throw new Error('the compiled registry must carry a model with several routes');
  return found;
})();

const DEFAULT_ROUTE_ID = (() => {
  const found = Object.entries(routes).find(
    ([, route]) => route.modelKey === MULTI_ROUTE_MODEL_KEY && route.isDefault,
  );
  if (!found) throw new Error(`${MULTI_ROUTE_MODEL_KEY} must have a default route`);
  return found[0];
})();

const ALTERNATE_ROUTE_ID = (() => {
  const found = Object.entries(routes).find(
    ([, route]) => route.modelKey === MULTI_ROUTE_MODEL_KEY && !route.isDefault,
  );
  if (!found) throw new Error(`${MULTI_ROUTE_MODEL_KEY} must have an additional route`);
  return found[0];
})();

const ALTERNATE_PROVIDER = routes[ALTERNATE_ROUTE_ID]?.provider ?? '';
const BYOK_REQUEST = {
  selection: MULTI_ROUTE_MODEL_KEY,
  taskType: 'coding',
  subscriptionTier: 'max',
  trustMode: 'byok',
} as const;

function stateWithUnavailableRoute(routeId: string): RoutingRuntimeState {
  return {
    routeHealth: { [routeId]: { available: false, reason: 'circuit_open' } },
    providerHealth: {},
    quotaPools: {},
    freeEligibility: {},
    capturedAtMs: 0,
  };
}

describe('ranked route selection', () => {
  it('keeps the canonical provider route as the default answer', () => {
    const decision = resolveAutoRoute(BYOK_REQUEST);

    expect(decision).toMatchObject({
      status: 'selected',
      modelKey: MULTI_ROUTE_MODEL_KEY,
      routeId: DEFAULT_ROUTE_ID,
    });
  });

  it('offers the other route of the same model as failover, never a different model', () => {
    const decision = resolveAutoRoute(BYOK_REQUEST);
    if (decision.status !== 'selected') throw new Error('expected a selected route');

    expect(decision.fallbacks).toEqual([
      {
        modelKey: MULTI_ROUTE_MODEL_KEY,
        provider: ALTERNATE_PROVIDER,
        providerModelId: expect.any(String),
        routeId: ALTERNATE_ROUTE_ID,
        harnessId: expect.any(String),
      },
    ]);
  });

  it('puts the same-model routes ahead of any model substitution', () => {
    const decision = resolveAutoRoute({
      selection: 'auto-balanced',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'byok',
    });
    if (decision.status !== 'selected') throw new Error('expected a selected route');

    expect(decision.modelKey).toBe(MULTI_ROUTE_MODEL_KEY);
    expect(decision.fallbacks[0]).toMatchObject({
      modelKey: MULTI_ROUTE_MODEL_KEY,
      routeId: ALTERNATE_ROUTE_ID,
    });
    expect(decision.fallbacks.slice(1).map((fallback) => fallback.modelKey)).not.toContain(
      MULTI_ROUTE_MODEL_KEY,
    );
  });

  it('does not offer a route whose harness the trust mode cannot reach', () => {
    const decision = resolveAutoRoute({ ...BYOK_REQUEST, trustMode: 'managed_cloud' });
    if (decision.status !== 'selected') throw new Error('expected a selected route');

    expect(decision.routeId).toBe(DEFAULT_ROUTE_ID);
    expect(decision.fallbacks).toEqual([]);
  });

  it('leaves an unhealthy route behind the healthy alternative', () => {
    const decision = resolveAutoRoute({
      ...BYOK_REQUEST,
      runtimeState: stateWithUnavailableRoute(DEFAULT_ROUTE_ID),
    });
    if (decision.status !== 'selected') throw new Error('expected a selected route');

    expect(decision.routeId).toBe(ALTERNATE_ROUTE_ID);
    expect(decision.fallbacks[0]?.routeId).toBe(DEFAULT_ROUTE_ID);
  });

  it('keeps the warm route when it is admissible, healthy and priced alike', () => {
    const decision = resolveAutoRoute({
      ...BYOK_REQUEST,
      preferredRouteId: ALTERNATE_ROUTE_ID,
    });

    expect(decision).toMatchObject({ status: 'selected', routeId: ALTERNATE_ROUTE_ID });
  });

  it('refuses a warm route the caller may not use', () => {
    const decision = resolveAutoRoute({
      ...BYOK_REQUEST,
      preferredRouteId: ALTERNATE_ROUTE_ID,
      runtimeState: stateWithUnavailableRoute(ALTERNATE_ROUTE_ID),
    });

    expect(decision).toMatchObject({ status: 'selected', routeId: DEFAULT_ROUTE_ID });
  });

  it('prices the warm route with its cache read rate', () => {
    const decision = resolveAutoRoute({
      ...BYOK_REQUEST,
      estimatedInputTokens: 500_000,
      estimatedOutputTokens: 1_000,
      preferredRouteId: ALTERNATE_ROUTE_ID,
    });

    expect(decision).toMatchObject({ status: 'selected', routeId: ALTERNATE_ROUTE_ID });
  });
});

describe('ranked route selection over synthetic route economics', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@agiworkforce/model-registry');
  });

  async function resolveAgainst(
    mutate: (registry: RoutingRegistryView) => void,
    request: Parameters<typeof resolveAutoRoute>[0],
  ): Promise<ReturnType<typeof resolveAutoRoute>> {
    const mutated = structuredClone(modelRegistry) as unknown as RoutingRegistryView;
    mutate(mutated);
    vi.resetModules();
    vi.doMock('@agiworkforce/model-registry', () => ({ modelRegistry: mutated }));
    const { resolveAutoRoute: resolveMocked } = await import('../auto');
    return resolveMocked(request);
  }

  it('never selects a blocked route, and never offers it as failover', async () => {
    const decision = await resolveAgainst((registry) => {
      const route = registry.routes[DEFAULT_ROUTE_ID];
      if (route) route.commercialStatus = 'blocked';
    }, BYOK_REQUEST);

    expect(decision).toMatchObject({ status: 'selected', routeId: ALTERNATE_ROUTE_ID });
    if (decision.status !== 'selected') throw new Error('expected a selected route');
    expect(decision.fallbacks).toEqual([]);
  });

  it('keeps an experimental route away from managed traffic but not from BYOK', async () => {
    const managed = await resolveAgainst(
      (registry) => {
        const route = registry.routes[DEFAULT_ROUTE_ID];
        if (route) route.commercialStatus = 'experimental_only';
      },
      { ...BYOK_REQUEST, trustMode: 'managed_cloud' },
    );
    expect(managed.status).toBe('unavailable');

    const byok = await resolveAgainst((registry) => {
      const route = registry.routes[DEFAULT_ROUTE_ID];
      if (route) route.commercialStatus = 'experimental_only';
    }, BYOK_REQUEST);
    expect(byok).toMatchObject({ status: 'selected', routeId: DEFAULT_ROUTE_ID });
  });

  it('selects the cheaper route of the same model', async () => {
    const decision = await resolveAgainst(
      (registry) => {
        const route = registry.routes[ALTERNATE_ROUTE_ID];
        const canonical = registry.routes[DEFAULT_ROUTE_ID];
        if (!route || !canonical) return;
        route.pricing.inputPerMillion = (canonical.pricing.inputPerMillion ?? 1) / 2;
        route.pricing.outputPerMillion = (canonical.pricing.outputPerMillion ?? 1) / 2;
      },
      { ...BYOK_REQUEST, estimatedInputTokens: 100_000 },
    );

    expect(decision).toMatchObject({ status: 'selected', routeId: ALTERNATE_ROUTE_ID });
  });

  it('drops the warm route once it costs more than the ceiling multiple', async () => {
    const decision = await resolveAgainst(
      (registry) => {
        const route = registry.routes[ALTERNATE_ROUTE_ID];
        const canonical = registry.routes[DEFAULT_ROUTE_ID];
        if (!route || !canonical) return;
        route.pricing.inputPerMillion = (canonical.pricing.inputPerMillion ?? 1) * 10;
        route.pricing.outputPerMillion = (canonical.pricing.outputPerMillion ?? 1) * 10;
        delete route.pricing.cacheReadPerMillion;
      },
      { ...BYOK_REQUEST, estimatedInputTokens: 100_000, preferredRouteId: ALTERNATE_ROUTE_ID },
    );

    expect(decision).toMatchObject({ status: 'selected', routeId: DEFAULT_ROUTE_ID });
  });
});
