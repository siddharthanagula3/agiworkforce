import { listCanonicalModels, type ModelMetadata } from '@agiworkforce/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canFailoverToOpenRouter,
  failoverMappedModelIds,
  isRoutedViaOpenRouter,
  mappedModelIds,
  openRouterFailoverSlugFor,
  openRouterSlugFor,
} from '../aggregator-routing';

const ENV_KEYS = ['OPENROUTER_API_KEY', 'AGI_OPENROUTER_ROUTED_PROVIDERS'] as const;
const saved: Record<string, string | undefined> = {};
const ROUTED_PROVIDERS = new Set(['minimax', 'qwen', 'zhipu']);
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
  return !NON_CHAT_MODEL_TYPES.has(model.modelType);
}

function requireCatalogModel(predicate: (model: ModelMetadata) => boolean): ModelMetadata {
  const model = listCanonicalModels().find(predicate);
  if (!model) throw new Error('Canonical OpenRouter routing fixture is missing');
  return model;
}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env['OPENROUTER_API_KEY'] = 'fixture-openrouter-key';
  delete process.env['AGI_OPENROUTER_ROUTED_PROVIDERS'];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('aggregator routing', () => {
  it.each([...ROUTED_PROVIDERS])('routes %s through OpenRouter', (provider) => {
    expect(isRoutedViaOpenRouter(provider)).toBe(true);
  });

  it.each([...DIRECT_FAILOVER_PROVIDERS])('leaves %s direct', (provider) => {
    expect(isRoutedViaOpenRouter(provider)).toBe(false);
  });

  it('does not route when there is no OpenRouter key', () => {
    delete process.env['OPENROUTER_API_KEY'];
    for (const provider of ROUTED_PROVIDERS) {
      expect(isRoutedViaOpenRouter(provider)).toBe(false);
    }
  });

  it('honours an env override, including turning routing off entirely', () => {
    const [enabledProvider, disabledProvider] = [...ROUTED_PROVIDERS];
    if (!enabledProvider || !disabledProvider)
      throw new Error('Routed provider fixtures are missing');

    process.env['AGI_OPENROUTER_ROUTED_PROVIDERS'] = enabledProvider;
    expect(isRoutedViaOpenRouter(enabledProvider)).toBe(true);
    expect(isRoutedViaOpenRouter(disabledProvider)).toBe(false);

    process.env['AGI_OPENROUTER_ROUTED_PROVIDERS'] = '';
    for (const provider of ROUTED_PROVIDERS) {
      expect(isRoutedViaOpenRouter(provider)).toBe(false);
    }
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
