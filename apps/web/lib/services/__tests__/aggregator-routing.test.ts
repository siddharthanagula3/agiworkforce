import {
  getRegistryRoute,
  isModelLive,
  listCanonicalModels,
  requireProviderDefaultModel,
  type ModelMetadata,
} from '@agiworkforce/types';
import { getRoutePricingForModel } from '@agiworkforce/model-registry';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { routeOverrides } = vi.hoisted(() => ({
  routeOverrides: new Map<string, unknown>(),
}));

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  return {
    ...actual,
    getRegistryRoute: (routeId: string) =>
      routeOverrides.get(routeId) ?? actual.getRegistryRoute(routeId),
  };
});

import {
  canFailoverToOpenRouter,
  dispatchProviderForRoute,
  failoverMappedModelIds,
  isManagedOpenRouterRoute,
  mappedModelIds,
  openRouterFailoverSlugFor,
  openRouterSlugFor,
  validateRouteSelection,
} from '../aggregator-routing';

const ENV_KEYS = ['OPENROUTER_API_KEY'] as const;
const saved: Record<string, string | undefined> = {};
const ROUTED_PROVIDERS = new Set(['minimax', 'qwen', 'zhipu']);
const MANAGED_ROUTED_MODEL_IDS = new Set(
  listCanonicalModels()
    .filter((model) => ROUTED_PROVIDERS.has(model.provider))
    .map((model) => model.id),
);
const DIRECT_FAILOVER_PROVIDERS = new Set([
  'anthropic',
  'openai',
  'google',
  'deepseek',
  'xai',
  'moonshot',
  'perplexity',
]);
const NON_CHAT_MODEL_TYPES = new Set(['image', 'video', 'audio', 'embedding', 'tts', 'stt']);

function providerApiModelId(model: ModelMetadata): string {
  return model.apiModelId ?? model.id;
}

function isChatModel(model: ModelMetadata): boolean {
  return isModelLive(model) && !NON_CHAT_MODEL_TYPES.has(model.modelType);
}

function requireCatalogModel(predicate: (model: ModelMetadata) => boolean): ModelMetadata {
  const model = listCanonicalModels().find(predicate);
  if (!model) throw new Error('Canonical OpenRouter routing fixture is missing');
  return model;
}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env['OPENROUTER_API_KEY'] = 'fixture-openrouter-key';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('aggregator routing', () => {
  it('admits managed traffic to the OpenRouter route the registry names', () => {
    const model = requireCatalogModel((candidate) => MANAGED_ROUTED_MODEL_IDS.has(candidate.id));
    expect(isManagedOpenRouterRoute(providerApiModelId(model))).toBe(true);
  });

  it.each([...DIRECT_FAILOVER_PROVIDERS])(
    "does not admit %s's OpenRouter route to managed traffic",
    (provider) => {
      const model = requireCatalogModel(
        (candidate) => candidate.provider === provider && isChatModel(candidate),
      );
      expect(isManagedOpenRouterRoute(providerApiModelId(model))).toBe(false);
    },
  );

  it('does not admit managed traffic when there is no OpenRouter key', () => {
    delete process.env['OPENROUTER_API_KEY'];
    const model = requireCatalogModel((candidate) => MANAGED_ROUTED_MODEL_IDS.has(candidate.id));
    expect(isManagedOpenRouterRoute(providerApiModelId(model))).toBe(false);
  });

  it('resolves the dispatch provider of a route id, mapping open_router to openrouter', () => {
    const minimaxModelId = requireCatalogModel((candidate) => candidate.provider === 'minimax').id;
    expect(dispatchProviderForRoute(`open_router/${minimaxModelId}`)).toBe('openrouter');
    expect(dispatchProviderForRoute(`minimax/${minimaxModelId}`)).toBe('minimax');
  });

  it('has no dispatch provider for a route id the registry does not declare', () => {
    expect(dispatchProviderForRoute('fixture-unknown/fixture-model')).toBeUndefined();
  });

  it('reads routed wire slugs from the canonical catalog', () => {
    const model = requireCatalogModel(
      (candidate) => ROUTED_PROVIDERS.has(candidate.provider) && !!candidate.openRouterSlug,
    );
    expect(openRouterSlugFor(providerApiModelId(model))).toBe(model.openRouterSlug);
  });

  it('has no slug for an unregistered model rather than inventing one', () => {
    expect(openRouterSlugFor('fixture-unregistered-model')).toBeUndefined();
  });

  it('requires a catalog-owned slug for every model belonging to a routed provider', () => {
    const routedModels = listCanonicalModels().filter((model) =>
      ROUTED_PROVIDERS.has(model.provider),
    );
    const missing = routedModels.filter((model) => !model.openRouterSlug).map(providerApiModelId);

    expect(missing, `catalog models missing an OpenRouter slug: ${missing.join(', ')}`).toEqual([]);
    expect(new Set(mappedModelIds())).toEqual(new Set(routedModels.map(providerApiModelId)));
  });
});

describe('OpenRouter failover routes', () => {
  it('offers the catalog-owned failover route for a directly called provider', () => {
    const model = requireCatalogModel(
      (candidate) =>
        DIRECT_FAILOVER_PROVIDERS.has(candidate.provider) &&
        isChatModel(candidate) &&
        !!candidate.openRouterSlug,
    );
    const apiModelId = providerApiModelId(model);

    expect(canFailoverToOpenRouter(model.provider, apiModelId)).toBe(true);
    expect(openRouterFailoverSlugFor(apiModelId)).toBe(model.openRouterSlug);
  });

  it.each(['openrouter', 'open_router'])('offers none when already on %s', (provider) => {
    const model = requireCatalogModel(
      (candidate) =>
        DIRECT_FAILOVER_PROVIDERS.has(candidate.provider) &&
        isChatModel(candidate) &&
        !!candidate.openRouterSlug,
    );
    expect(canFailoverToOpenRouter(provider, providerApiModelId(model))).toBe(false);
  });

  it('offers none without a key', () => {
    const model = requireCatalogModel(
      (candidate) =>
        DIRECT_FAILOVER_PROVIDERS.has(candidate.provider) &&
        isChatModel(candidate) &&
        !!candidate.openRouterSlug,
    );
    delete process.env['OPENROUTER_API_KEY'];
    expect(canFailoverToOpenRouter(model.provider, providerApiModelId(model))).toBe(false);
  });

  it('requires a catalog-owned failover slug for every direct-provider chat model', () => {
    const directChatModels = listCanonicalModels().filter(
      (model) => DIRECT_FAILOVER_PROVIDERS.has(model.provider) && isChatModel(model),
    );
    const missing = directChatModels
      .filter((model) => !model.openRouterSlug)
      .map(providerApiModelId);

    expect(missing, `catalog chat models missing a failover slug: ${missing.join(', ')}`).toEqual(
      [],
    );
    expect(new Set(failoverMappedModelIds())).toEqual(
      new Set(directChatModels.map(providerApiModelId)),
    );
  });

  it('never classifies one model as both a permanent route and a failover route', () => {
    const failoverIds = new Set(failoverMappedModelIds());
    const both = mappedModelIds().filter((id) => failoverIds.has(id));
    expect(both).toEqual([]);
  });
});

const anthropicRoutes = getRoutePricingForModel(requireProviderDefaultModel('anthropic'))
  .map((route) => ({ routeId: route.routeId, registryRoute: getRegistryRoute(route.routeId) }))
  .filter(
    (entry): entry is { routeId: string; registryRoute: NonNullable<typeof entry.registryRoute> } =>
      entry.registryRoute !== null,
  );

const DEFAULT_ANTHROPIC_ROUTE_ID = anthropicRoutes.find(
  ({ registryRoute }) => registryRoute.isDefault,
)!.routeId;
const MANAGED_ONLY_EXPERIMENTAL_ROUTE_ID = anthropicRoutes.find(
  ({ registryRoute }) =>
    registryRoute.commercialStatus === 'experimental_only' &&
    registryRoute.trustModes.includes('managed_cloud') &&
    !registryRoute.trustModes.includes('byok'),
)!.routeId;
const BYOK_ONLY_EXPERIMENTAL_ROUTE_ID = anthropicRoutes.find(
  ({ registryRoute }) =>
    registryRoute.commercialStatus === 'experimental_only' &&
    registryRoute.trustModes.includes('byok') &&
    !registryRoute.trustModes.includes('managed_cloud'),
)!.routeId;
const FIXTURE_BLOCKED_ROUTE_ID = 'fixture_blocked_provider/fixture-blocked-model';

describe('validateRouteSelection', () => {
  afterEach(() => {
    routeOverrides.clear();
  });

  it('rejects a route id the registry does not declare', () => {
    expect(
      validateRouteSelection('fixture-unknown/fixture-model', {
        modelId: 'fixture-model',
        trustMode: 'managed_cloud',
        hasUserProviderKey: false,
      }),
    ).toEqual({ ok: false, reason: 'unknown_route' });
  });

  it('rejects a route whose model does not match the request', () => {
    const anthropicModel = requireProviderDefaultModel('anthropic');
    const otherModel = requireProviderDefaultModel('openai');
    expect(anthropicModel).not.toBe(otherModel);

    expect(
      validateRouteSelection(DEFAULT_ANTHROPIC_ROUTE_ID, {
        modelId: otherModel,
        trustMode: 'managed_cloud',
        hasUserProviderKey: false,
      }),
    ).toEqual({ ok: false, reason: 'model_mismatch' });
  });

  it('rejects a route not open to the request trust mode', () => {
    const model = requireProviderDefaultModel('anthropic');

    expect(
      validateRouteSelection(MANAGED_ONLY_EXPERIMENTAL_ROUTE_ID, {
        modelId: model,
        trustMode: 'byok',
        hasUserProviderKey: true,
      }),
    ).toEqual({ ok: false, reason: 'trust_mode_not_permitted' });
  });

  it('never admits a blocked route regardless of trust mode or key', () => {
    routeOverrides.set(FIXTURE_BLOCKED_ROUTE_ID, {
      modelKey: 'fixture-blocked-model',
      provider: 'fixture_blocked_provider',
      harnessId: 'fixture-blocked-provider/chat-completions',
      trustModes: ['managed_cloud', 'byok'],
      isDefault: false,
      commercialStatus: 'blocked',
    });

    expect(
      validateRouteSelection(FIXTURE_BLOCKED_ROUTE_ID, {
        modelId: 'fixture-blocked-model',
        trustMode: 'byok',
        hasUserProviderKey: true,
      }),
    ).toEqual({ ok: false, reason: 'commercial_status_not_admitted' });
  });

  it('never admits an experimental-only route to managed traffic', () => {
    const model = requireProviderDefaultModel('anthropic');

    expect(
      validateRouteSelection(MANAGED_ONLY_EXPERIMENTAL_ROUTE_ID, {
        modelId: model,
        trustMode: 'managed_cloud',
        hasUserProviderKey: true,
      }),
    ).toEqual({ ok: false, reason: 'commercial_status_not_admitted' });
  });

  it('admits an experimental-only route to byok traffic only when a user key exists', () => {
    const model = requireProviderDefaultModel('anthropic');

    expect(
      validateRouteSelection(BYOK_ONLY_EXPERIMENTAL_ROUTE_ID, {
        modelId: model,
        trustMode: 'byok',
        hasUserProviderKey: false,
      }),
    ).toEqual({ ok: false, reason: 'commercial_status_not_admitted' });

    expect(
      validateRouteSelection(BYOK_ONLY_EXPERIMENTAL_ROUTE_ID, {
        modelId: model,
        trustMode: 'byok',
        hasUserProviderKey: true,
      }),
    ).toEqual({ ok: true, reason: null });
  });

  it('admits the default route for managed traffic', () => {
    const model = requireProviderDefaultModel('anthropic');

    expect(
      validateRouteSelection(DEFAULT_ANTHROPIC_ROUTE_ID, {
        modelId: model,
        trustMode: 'managed_cloud',
        hasUserProviderKey: false,
      }),
    ).toEqual({ ok: true, reason: null });
  });
});
