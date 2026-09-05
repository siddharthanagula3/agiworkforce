import type { ChatRequest } from '@agiworkforce/types';
import type { OpenAIChatCompletionCreateParams } from '@agiworkforce/providers-openai';

export type OpenRouterDataCollectionPolicy = 'allow' | 'deny';

export interface OpenRouterProviderRoutingPreferences {
  order?: readonly string[];
  allowFallbacks?: boolean;
  dataCollection?: OpenRouterDataCollectionPolicy;
}

interface OpenRouterProviderRoutingField {
  order?: string[];
  allow_fallbacks?: boolean;
  data_collection?: OpenRouterDataCollectionPolicy;
}

const OPENROUTER_REQUEST_METADATA_ROUTING_KEY = 'openRouterProviderRouting';

function isDataCollectionPolicy(value: unknown): value is OpenRouterDataCollectionPolicy {
  return value === 'allow' || value === 'deny';
}

function readMetadataRoutingPreferences(
  metadata: ChatRequest['metadata'],
): OpenRouterProviderRoutingPreferences | undefined {
  const raw = metadata?.[OPENROUTER_REQUEST_METADATA_ROUTING_KEY];
  if (!raw || typeof raw !== 'object') return undefined;
  const { order, allowFallbacks, dataCollection } = raw as Record<string, unknown>;
  return {
    ...(Array.isArray(order)
      ? { order: order.filter((entry): entry is string => typeof entry === 'string') }
      : {}),
    ...(typeof allowFallbacks === 'boolean' ? { allowFallbacks } : {}),
    ...(isDataCollectionPolicy(dataCollection) ? { dataCollection } : {}),
  };
}

const ZERO_DATA_RETENTION_POLICY: OpenRouterDataCollectionPolicy = 'deny';

export function applyOpenRouterProviderRouting(
  params: OpenAIChatCompletionCreateParams,
  configDefault: OpenRouterProviderRoutingPreferences | undefined,
  requestMetadata: ChatRequest['metadata'],
  zeroDataRetentionOnly?: boolean,
): void {
  const requestOverride = readMetadataRoutingPreferences(requestMetadata);
  const merged: OpenRouterProviderRoutingPreferences = {
    ...configDefault,
    ...requestOverride,
    ...(zeroDataRetentionOnly ? { dataCollection: ZERO_DATA_RETENTION_POLICY } : {}),
  };
  if (
    merged.order === undefined &&
    merged.allowFallbacks === undefined &&
    merged.dataCollection === undefined
  ) {
    return;
  }
  const field: OpenRouterProviderRoutingField = {
    ...(merged.order !== undefined ? { order: [...merged.order] } : {}),
    ...(merged.allowFallbacks !== undefined ? { allow_fallbacks: merged.allowFallbacks } : {}),
    ...(merged.dataCollection !== undefined ? { data_collection: merged.dataCollection } : {}),
  };
  (params as unknown as { provider?: OpenRouterProviderRoutingField }).provider = field;
}
