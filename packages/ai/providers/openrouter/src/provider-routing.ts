import type { ChatRequest } from '@agiworkforce/types';
import type { OpenAIChatCompletionCreateParams } from '@agiworkforce/providers-openai';

export type OpenRouterDataCollectionPolicy = 'allow' | 'deny';
export type OpenRouterProviderSort = 'price' | 'throughput' | 'latency';

export interface OpenRouterMaxPrice {
  prompt?: number;
  completion?: number;
}

export interface OpenRouterProviderRoutingPreferences {
  order?: readonly string[];
  allowFallbacks?: boolean;
  dataCollection?: OpenRouterDataCollectionPolicy;
  sort?: OpenRouterProviderSort;
  maxPrice?: OpenRouterMaxPrice;
}

interface OpenRouterProviderRoutingField {
  order?: string[];
  allow_fallbacks?: boolean;
  data_collection?: OpenRouterDataCollectionPolicy;
  sort?: OpenRouterProviderSort;
  max_price?: OpenRouterMaxPrice;
  zdr?: boolean;
}

const OPENROUTER_REQUEST_METADATA_ROUTING_KEY = 'openRouterProviderRouting';
const PROVIDER_SORTS: ReadonlySet<string> = new Set<OpenRouterProviderSort>([
  'price',
  'throughput',
  'latency',
]);

function isDataCollectionPolicy(value: unknown): value is OpenRouterDataCollectionPolicy {
  return value === 'allow' || value === 'deny';
}

function isProviderSort(value: unknown): value is OpenRouterProviderSort {
  return typeof value === 'string' && PROVIDER_SORTS.has(value);
}

function isPriceCeiling(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function readMaxPrice(raw: unknown): OpenRouterMaxPrice | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { prompt, completion } = raw as Record<string, unknown>;
  const maxPrice: OpenRouterMaxPrice = {
    ...(isPriceCeiling(prompt) ? { prompt } : {}),
    ...(isPriceCeiling(completion) ? { completion } : {}),
  };
  return Object.keys(maxPrice).length > 0 ? maxPrice : undefined;
}

function readMetadataRoutingPreferences(
  metadata: ChatRequest['metadata'],
): OpenRouterProviderRoutingPreferences | undefined {
  const raw = metadata?.[OPENROUTER_REQUEST_METADATA_ROUTING_KEY];
  if (!raw || typeof raw !== 'object') return undefined;
  const { order, allowFallbacks, dataCollection, sort, maxPrice } = raw as Record<string, unknown>;
  const parsedMaxPrice = readMaxPrice(maxPrice);
  return {
    ...(Array.isArray(order)
      ? { order: order.filter((entry): entry is string => typeof entry === 'string') }
      : {}),
    ...(typeof allowFallbacks === 'boolean' ? { allowFallbacks } : {}),
    ...(isDataCollectionPolicy(dataCollection) ? { dataCollection } : {}),
    ...(isProviderSort(sort) ? { sort } : {}),
    ...(parsedMaxPrice ? { maxPrice: parsedMaxPrice } : {}),
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
    !zeroDataRetentionOnly &&
    merged.order === undefined &&
    merged.allowFallbacks === undefined &&
    merged.dataCollection === undefined &&
    merged.sort === undefined &&
    merged.maxPrice === undefined
  ) {
    return;
  }
  const field: OpenRouterProviderRoutingField = {
    ...(merged.order !== undefined ? { order: [...merged.order] } : {}),
    ...(merged.allowFallbacks !== undefined ? { allow_fallbacks: merged.allowFallbacks } : {}),
    ...(merged.dataCollection !== undefined ? { data_collection: merged.dataCollection } : {}),
    ...(merged.sort !== undefined ? { sort: merged.sort } : {}),
    ...(merged.maxPrice !== undefined ? { max_price: { ...merged.maxPrice } } : {}),
    ...(zeroDataRetentionOnly ? { zdr: true } : {}),
  };
  (params as unknown as { provider?: OpenRouterProviderRoutingField }).provider = field;
}
