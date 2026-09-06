import {
  LIFECYCLE_STAGES,
  lifecycleStageAtOrAfter,
  modelRegistry,
} from '@agiworkforce/model-registry';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AutoRouteDecision,
  AutoRoutingRequest,
  IntrinsicCapability,
  RoutingRegistryView,
} from '../auto';
import type { RoutingRuntimeState } from '../runtime-state';

const SYNTHETIC_MODEL_KEY = 'route-ranking-test-model';
const SYNTHETIC_DEFAULT_PROVIDER = 'route-ranking-test-default-provider';
const SYNTHETIC_ALTERNATE_PROVIDER = 'route-ranking-test-alternate-provider';
const SYNTHETIC_HARNESS_ID = 'route-ranking-test/chat-completions';

const REAL_ALIAS_ID = 'auto-balanced';
const TASK_TYPE = 'coding' as const;
const SUBSCRIPTION_TIER = 'max';
const CONTEXT_TOKENS_LIMIT = 128_000;
const BASE_INPUT_PER_MILLION = 1;
const BASE_OUTPUT_PER_MILLION = 2;
const BASE_CACHE_READ_PER_MILLION = 0.1;
const BASE_CACHE_WRITE_PER_MILLION = 0;

const DEFAULT_ROUTE_ID = `${SYNTHETIC_DEFAULT_PROVIDER}/${SYNTHETIC_MODEL_KEY}`;
const ALTERNATE_ROUTE_ID = `${SYNTHETIC_ALTERNATE_PROVIDER}/${SYNTHETIC_MODEL_KEY}`;
const ALTERNATE_PROVIDER = SYNTHETIC_ALTERNATE_PROVIDER;

const ALL_CAPABILITIES: Record<IntrinsicCapability, boolean> = {
  textInput: true,
  imageInput: true,
  audioInput: true,
  videoInput: true,
  textOutput: true,
  imageOutput: true,
  audioOutput: true,
  videoOutput: true,
  streaming: true,
  structuredOutput: true,
  functionCalling: true,
  reasoning: true,
};

const BYOK_REQUEST: AutoRoutingRequest = {
  selection: SYNTHETIC_MODEL_KEY,
  taskType: TASK_TYPE,
  subscriptionTier: SUBSCRIPTION_TIER,
  trustMode: 'byok',
};

function buildSyntheticRegistry(): RoutingRegistryView {
  const base = structuredClone(modelRegistry) as unknown as RoutingRegistryView;
  return {
    ...base,
    models: {
      ...base.models,
      [SYNTHETIC_MODEL_KEY]: {
        identity: {
          key: SYNTHETIC_MODEL_KEY,
          provider: SYNTHETIC_DEFAULT_PROVIDER,
          providerModelId: SYNTHETIC_MODEL_KEY,
        },
        lifecycle: { availability: 'live', deprecated: false },
      },
    },
    routes: {
      ...base.routes,
      [DEFAULT_ROUTE_ID]: {
        modelKey: SYNTHETIC_MODEL_KEY,
        provider: SYNTHETIC_DEFAULT_PROVIDER,
        providerModelId: SYNTHETIC_MODEL_KEY,
        harnessId: SYNTHETIC_HARNESS_ID,
        trustModes: ['byok', 'managed_cloud'],
        availability: 'live',
        selectable: true,
        isDefault: true,
        cacheClass: 'no_provider_cache',
        commercialStatus: 'agi_direct',
        pricing: {
          currency: 'USD',
          unit: 'per_million_tokens',
          inputPerMillion: BASE_INPUT_PER_MILLION,
          outputPerMillion: BASE_OUTPUT_PER_MILLION,
          cacheReadPerMillion: BASE_CACHE_READ_PER_MILLION,
          cacheWritePerMillion: BASE_CACHE_WRITE_PER_MILLION,
        },
      },
      [ALTERNATE_ROUTE_ID]: {
        modelKey: SYNTHETIC_MODEL_KEY,
        provider: SYNTHETIC_ALTERNATE_PROVIDER,
        providerModelId: SYNTHETIC_MODEL_KEY,
        harnessId: SYNTHETIC_HARNESS_ID,
        trustModes: ['byok'],
        availability: 'live',
        selectable: true,
        isDefault: false,
        cacheClass: 'no_provider_cache',
        commercialStatus: 'authorized_marketplace',
        pricing: {
          currency: 'USD',
          unit: 'per_million_tokens',
          inputPerMillion: BASE_INPUT_PER_MILLION,
          outputPerMillion: BASE_OUTPUT_PER_MILLION,
          cacheReadPerMillion: BASE_CACHE_READ_PER_MILLION,
          cacheWritePerMillion: BASE_CACHE_WRITE_PER_MILLION,
        },
      },
    },
    capabilities: {
      ...base.capabilities,
      [SYNTHETIC_MODEL_KEY]: ALL_CAPABILITIES,
    },
    limits: {
      ...base.limits,
      [SYNTHETIC_MODEL_KEY]: { contextTokens: CONTEXT_TOKENS_LIMIT },
    },
  };
}

function stateWithUnavailableRoute(routeId: string): RoutingRuntimeState {
  return {
    routeHealth: { [routeId]: { available: false, reason: 'circuit_open' } },
    providerHealth: {},
    quotaPools: {},
    freeEligibility: {},
    capturedAtMs: 0,
  };
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@agiworkforce/model-registry');
});

async function resolveWithRegistry(
  request: AutoRoutingRequest,
  mutate?: (registry: RoutingRegistryView) => void,
): Promise<AutoRouteDecision> {
  const registry = buildSyntheticRegistry();
  mutate?.(registry);
  vi.resetModules();
  vi.doMock('@agiworkforce/model-registry', () => ({
    modelRegistry: registry,
    LIFECYCLE_STAGES,
    lifecycleStageAtOrAfter,
  }));
  const { resolveAutoRoute } = await import('../auto');
  return resolveAutoRoute(request);
}

describe('ranked route selection', () => {
  it('keeps the canonical provider route as the default answer', async () => {
    const decision = await resolveWithRegistry(BYOK_REQUEST);

    expect(decision).toMatchObject({
      status: 'selected',
      modelKey: SYNTHETIC_MODEL_KEY,
      routeId: DEFAULT_ROUTE_ID,
    });
  });

  it('offers the other route of the same model as failover, never a different model', async () => {
    const decision = await resolveWithRegistry(BYOK_REQUEST);
    if (decision.status !== 'selected') throw new Error('expected a selected route');

    expect(decision.fallbacks).toEqual([
      {
        modelKey: SYNTHETIC_MODEL_KEY,
        provider: ALTERNATE_PROVIDER,
        providerModelId: expect.any(String),
        routeId: ALTERNATE_ROUTE_ID,
        harnessId: expect.any(String),
      },
    ]);
  });

  it('puts the same-model routes ahead of any model substitution', async () => {
    const aliasRequest: AutoRoutingRequest = {
      selection: REAL_ALIAS_ID,
      taskType: TASK_TYPE,
      subscriptionTier: SUBSCRIPTION_TIER,
      trustMode: 'byok',
    };

    const discovery = await resolveWithRegistry(aliasRequest);
    if (discovery.status !== 'selected') throw new Error('expected the alias to resolve');
    const targetModelKey = discovery.modelKey;
    const targetAlternateRouteId = `${SYNTHETIC_ALTERNATE_PROVIDER}/${targetModelKey}`;

    const decision = await resolveWithRegistry(aliasRequest, (registry) => {
      const targetDefaultRoute = Object.values(registry.routes).find(
        (route) => route.modelKey === targetModelKey && route.isDefault,
      );
      if (!targetDefaultRoute) throw new Error(`missing default route for ${targetModelKey}`);
      for (const [routeId, route] of Object.entries(registry.routes)) {
        if (route.modelKey === targetModelKey && !route.isDefault) delete registry.routes[routeId];
      }
      registry.routes[targetAlternateRouteId] = {
        ...targetDefaultRoute,
        provider: SYNTHETIC_ALTERNATE_PROVIDER,
        harnessId: SYNTHETIC_HARNESS_ID,
        trustModes: ['byok'],
        isDefault: false,
        cacheClass: 'no_provider_cache',
        commercialStatus: 'authorized_marketplace',
      };
    });
    if (decision.status !== 'selected') throw new Error('expected a selected route');

    expect(decision.modelKey).toBe(targetModelKey);
    expect(decision.fallbacks[0]).toMatchObject({
      modelKey: targetModelKey,
      routeId: targetAlternateRouteId,
    });
    expect(decision.fallbacks.slice(1).map((fallback) => fallback.modelKey)).not.toContain(
      targetModelKey,
    );
  });

  it('does not offer a route whose harness the trust mode cannot reach', async () => {
    const decision = await resolveWithRegistry({ ...BYOK_REQUEST, trustMode: 'managed_cloud' });
    if (decision.status !== 'selected') throw new Error('expected a selected route');

    expect(decision.routeId).toBe(DEFAULT_ROUTE_ID);
    expect(decision.fallbacks).toEqual([]);
  });

  it('excludes a route whose provider has no available credential', async () => {
    const decision = await resolveWithRegistry({
      ...BYOK_REQUEST,
      availableProviderIds: new Set([SYNTHETIC_ALTERNATE_PROVIDER]),
    });
    if (decision.status !== 'selected') throw new Error('expected a selected route');

    expect(decision.routeId).toBe(ALTERNATE_ROUTE_ID);
    expect(decision.fallbacks).toEqual([]);
  });

  it('keeps every route admissible when no route of the model has a credential', async () => {
    const decision = await resolveWithRegistry({
      ...BYOK_REQUEST,
      availableProviderIds: new Set(['route-ranking-test-unrelated-provider']),
    });
    if (decision.status !== 'selected') throw new Error('expected a selected route');

    expect(decision.routeId).toBe(DEFAULT_ROUTE_ID);
    expect(decision.fallbacks).toEqual([
      {
        modelKey: SYNTHETIC_MODEL_KEY,
        provider: ALTERNATE_PROVIDER,
        providerModelId: expect.any(String),
        routeId: ALTERNATE_ROUTE_ID,
        harnessId: expect.any(String),
      },
    ]);
  });

  it('leaves an unhealthy route behind the healthy alternative', async () => {
    const decision = await resolveWithRegistry({
      ...BYOK_REQUEST,
      runtimeState: stateWithUnavailableRoute(DEFAULT_ROUTE_ID),
    });
    if (decision.status !== 'selected') throw new Error('expected a selected route');

    expect(decision.routeId).toBe(ALTERNATE_ROUTE_ID);
    expect(decision.fallbacks[0]?.routeId).toBe(DEFAULT_ROUTE_ID);
  });

  it('keeps the warm route when it is admissible, healthy and priced alike', async () => {
    const decision = await resolveWithRegistry({
      ...BYOK_REQUEST,
      preferredRouteId: ALTERNATE_ROUTE_ID,
    });

    expect(decision).toMatchObject({ status: 'selected', routeId: ALTERNATE_ROUTE_ID });
  });

  it('refuses a warm route the caller may not use', async () => {
    const decision = await resolveWithRegistry({
      ...BYOK_REQUEST,
      preferredRouteId: ALTERNATE_ROUTE_ID,
      runtimeState: stateWithUnavailableRoute(ALTERNATE_ROUTE_ID),
    });

    expect(decision).toMatchObject({ status: 'selected', routeId: DEFAULT_ROUTE_ID });
  });

  it('prices the warm route with its cache read rate', async () => {
    const decision = await resolveWithRegistry({
      ...BYOK_REQUEST,
      estimatedInputTokens: 500_000,
      estimatedOutputTokens: 1_000,
      preferredRouteId: ALTERNATE_ROUTE_ID,
    });

    expect(decision).toMatchObject({ status: 'selected', routeId: ALTERNATE_ROUTE_ID });
  });
});

describe('ranked route selection over synthetic route economics', () => {
  it('never selects a blocked route, and never offers it as failover', async () => {
    const decision = await resolveWithRegistry(BYOK_REQUEST, (registry) => {
      const route = registry.routes[DEFAULT_ROUTE_ID];
      if (route) route.commercialStatus = 'blocked';
    });

    expect(decision).toMatchObject({ status: 'selected', routeId: ALTERNATE_ROUTE_ID });
    if (decision.status !== 'selected') throw new Error('expected a selected route');
    expect(decision.fallbacks).toEqual([]);
  });

  it('keeps an experimental route away from managed traffic but not from BYOK', async () => {
    const managed = await resolveWithRegistry(
      { ...BYOK_REQUEST, trustMode: 'managed_cloud' },
      (registry) => {
        const route = registry.routes[DEFAULT_ROUTE_ID];
        if (route) route.commercialStatus = 'experimental_only';
      },
    );
    expect(managed.status).toBe('unavailable');

    const byok = await resolveWithRegistry(BYOK_REQUEST, (registry) => {
      const route = registry.routes[DEFAULT_ROUTE_ID];
      if (route) route.commercialStatus = 'experimental_only';
    });
    expect(byok).toMatchObject({ status: 'selected', routeId: DEFAULT_ROUTE_ID });
  });

  it('selects the cheaper route of the same model', async () => {
    const decision = await resolveWithRegistry(
      { ...BYOK_REQUEST, estimatedInputTokens: 100_000 },
      (registry) => {
        const route = registry.routes[ALTERNATE_ROUTE_ID];
        const canonical = registry.routes[DEFAULT_ROUTE_ID];
        if (!route || !canonical) return;
        route.pricing.inputPerMillion = (canonical.pricing.inputPerMillion ?? 1) / 2;
        route.pricing.outputPerMillion = (canonical.pricing.outputPerMillion ?? 1) / 2;
      },
    );

    expect(decision).toMatchObject({ status: 'selected', routeId: ALTERNATE_ROUTE_ID });
  });

  it('drops the warm route once it costs more than the ceiling multiple', async () => {
    const decision = await resolveWithRegistry(
      {
        ...BYOK_REQUEST,
        estimatedInputTokens: 100_000,
        preferredRouteId: ALTERNATE_ROUTE_ID,
      },
      (registry) => {
        const route = registry.routes[ALTERNATE_ROUTE_ID];
        const canonical = registry.routes[DEFAULT_ROUTE_ID];
        if (!route || !canonical) return;
        route.pricing.inputPerMillion = (canonical.pricing.inputPerMillion ?? 1) * 10;
        route.pricing.outputPerMillion = (canonical.pricing.outputPerMillion ?? 1) * 10;
        delete route.pricing.cacheReadPerMillion;
      },
    );

    expect(decision).toMatchObject({ status: 'selected', routeId: DEFAULT_ROUTE_ID });
  });
});
