import 'server-only';

import {
  getModelMetadataById,
  getRegistryRoute,
  listCanonicalModels,
  type ModelMetadata,
} from '@agiworkforce/types';

const MANAGED_CLOUD_TRUST_MODE = 'managed_cloud';
const OPEN_ROUTER_PROVIDER = 'open_router';

const DEFAULT_ROUTED_PROVIDERS = ['minimax', 'qwen', 'zhipu'] as const;
const DEFAULT_ROUTED_PROVIDER_SET: ReadonlySet<string> = new Set(DEFAULT_ROUTED_PROVIDERS);

function providerApiModelId(model: ModelMetadata): string {
  return model.apiModelId ?? model.id;
}

function isCatalogChatModel(model: ModelMetadata): boolean {
  return !new Set(['image', 'video', 'audio', 'embedding', 'tts', 'stt']).has(model.modelType);
}

function isPermanentOpenRouterRoute(model: ModelMetadata): boolean {
  return DEFAULT_ROUTED_PROVIDER_SET.has(model.provider);
}

function isOpenRouterFailoverRoute(model: ModelMetadata): boolean {
  return (
    model.provider !== 'open_router' &&
    !isPermanentOpenRouterRoute(model) &&
    isCatalogChatModel(model)
  );
}

export function isManagedOpenRouterRoute(apiModelId: string): boolean {
  if (!process.env['OPENROUTER_API_KEY']) return false;
  const model = getModelMetadataById(apiModelId);
  if (!model) return false;
  const route = getRegistryRoute(`${OPEN_ROUTER_PROVIDER}/${model.id}`);
  return route?.trustModes.includes(MANAGED_CLOUD_TRUST_MODE) ?? false;
}

export function dispatchProviderForRoute(routeId: string): string | undefined {
  const route = getRegistryRoute(routeId);
  if (!route) return undefined;
  return route.provider === OPEN_ROUTER_PROVIDER ? 'openrouter' : route.provider;
}

export function openRouterSlugFor(apiModelId: string): string | undefined {
  const model = getModelMetadataById(apiModelId);
  if (!model || !isPermanentOpenRouterRoute(model)) return undefined;
  return model.openRouterSlug;
}

export function mappedModelIds(): readonly string[] {
  return listCanonicalModels()
    .filter((model) => isPermanentOpenRouterRoute(model) && model.openRouterSlug)
    .map(providerApiModelId);
}

export function openRouterFailoverSlugFor(apiModelId: string): string | undefined {
  const model = getModelMetadataById(apiModelId);
  if (!model || !isOpenRouterFailoverRoute(model)) return undefined;
  return model.openRouterSlug;
}

export function canFailoverToOpenRouter(providerId: string, apiModelId: string): boolean {
  if (!process.env['OPENROUTER_API_KEY']) return false;
  if (providerId === 'openrouter' || providerId === 'open_router') return false;
  return openRouterFailoverSlugFor(apiModelId) !== undefined;
}

export function failoverMappedModelIds(): readonly string[] {
  return listCanonicalModels()
    .filter((model) => isOpenRouterFailoverRoute(model) && model.openRouterSlug)
    .map(providerApiModelId);
}
