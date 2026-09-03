import type { ChatRequest } from '@agiworkforce/types';
import type { OpenAIChatCompletionCreateParams } from '@agiworkforce/providers-openai';

export type VercelGatewaySortMetric = 'cost' | 'ttft' | 'tps';
export type VercelGatewayCachingMode = 'auto';

export interface VercelGatewayProviderOptions {
  order?: readonly string[];
  only?: readonly string[];
  sort?: VercelGatewaySortMetric;
  caching?: VercelGatewayCachingMode;
}

interface VercelGatewayGatewayField {
  order?: string[];
  only?: string[];
  sort?: VercelGatewaySortMetric;
  caching?: VercelGatewayCachingMode;
}

const VERCEL_GATEWAY_REQUEST_METADATA_KEY = 'vercelGatewayProviderOptions';

function isSortMetric(value: unknown): value is VercelGatewaySortMetric {
  return value === 'cost' || value === 'ttft' || value === 'tps';
}

function isCachingMode(value: unknown): value is VercelGatewayCachingMode {
  return value === 'auto';
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : undefined;
}

function readMetadataProviderOptions(
  metadata: ChatRequest['metadata'],
): VercelGatewayProviderOptions | undefined {
  const raw = metadata?.[VERCEL_GATEWAY_REQUEST_METADATA_KEY];
  if (!raw || typeof raw !== 'object') return undefined;
  const { order, only, sort, caching } = raw as Record<string, unknown>;
  const orderList = readStringArray(order);
  const onlyList = readStringArray(only);
  return {
    ...(orderList !== undefined ? { order: orderList } : {}),
    ...(onlyList !== undefined ? { only: onlyList } : {}),
    ...(isSortMetric(sort) ? { sort } : {}),
    ...(isCachingMode(caching) ? { caching } : {}),
  };
}

export function applyVercelGatewayProviderOptions(
  params: OpenAIChatCompletionCreateParams,
  configDefault: VercelGatewayProviderOptions | undefined,
  requestMetadata: ChatRequest['metadata'],
): void {
  const requestOverride = readMetadataProviderOptions(requestMetadata);
  const merged: VercelGatewayProviderOptions = { ...configDefault, ...requestOverride };
  if (
    merged.order === undefined &&
    merged.only === undefined &&
    merged.sort === undefined &&
    merged.caching === undefined
  ) {
    return;
  }
  const gateway: VercelGatewayGatewayField = {
    ...(merged.order !== undefined ? { order: [...merged.order] } : {}),
    ...(merged.only !== undefined ? { only: [...merged.only] } : {}),
    ...(merged.sort !== undefined ? { sort: merged.sort } : {}),
    ...(merged.caching !== undefined ? { caching: merged.caching } : {}),
  };
  (
    params as unknown as { providerOptions?: { gateway: VercelGatewayGatewayField } }
  ).providerOptions = { gateway };
}
