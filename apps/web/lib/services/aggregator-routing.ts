import 'server-only';

import { getModelMetadataById, listCanonicalModels, type ModelMetadata } from '@agiworkforce/types';

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

function routedProviders(): ReadonlySet<string> {
  const override = process.env['AGI_OPENROUTER_ROUTED_PROVIDERS'];
  if (override === undefined) return new Set(DEFAULT_ROUTED_PROVIDERS);
  return new Set(
    override
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isRoutedViaOpenRouter(providerId: string): boolean {
  if (!process.env['OPENROUTER_API_KEY']) return false;
  return routedProviders().has(providerId.toLowerCase());
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
