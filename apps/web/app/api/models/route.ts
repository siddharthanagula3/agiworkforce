import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { logger } from '@/lib/logger';
import {
  listCanonicalModels,
  modelsCatalogJson as modelsData,
  type ModelMetadata,
  type ModelCapabilities as CatalogModelCapabilities,
} from '@agiworkforce/types';
import {
  getProviderAvailabilityMap,
  type ProviderAvailabilitySignal,
} from '@/lib/services/provider-availability-service';

export const runtime = 'nodejs';

type ModelCapabilities = Pick<
  CatalogModelCapabilities,
  | 'vision'
  | 'tools'
  | 'streaming'
  | 'thinking'
  | 'imageGen'
  | 'videoGen'
  | 'codeExecution'
  | 'search'
>;

interface ModelInputTokenPricingTier {
  thresholdTokens: number;
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
  cachedWritePerMillion?: number;
  cachedWrite1hPerMillion?: number;
}

interface ModelPricing {
  basis: 'base';
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
  cachedWritePerMillion?: number;
  cachedWrite1hPerMillion?: number;
  inputTokenPricingTiers: ModelInputTokenPricingTier[];
}

export type ModelAvailabilityStatus = { state: 'available' } | ProviderAvailabilitySignal;

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  category: 'chat' | 'code' | 'reasoning' | 'image' | 'video' | 'other';
  contextWindow: number | null;
  maxOutputTokens: number | null;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
  speed: string | null;
  quality: string | null;
  bestFor: string[];
  released: string | null;
  availability: ModelAvailabilityStatus;
}

const AVAILABLE_STATUS: ModelAvailabilityStatus = { state: 'available' };

interface ModelsJson {
  version: number;
  lastUpdated: string;
  models: Record<string, ModelMetadata>;
}

function toCategory(modelType: string | undefined): ModelEntry['category'] {
  switch (modelType) {
    case 'chat':
      return 'chat';
    case 'code':
      return 'code';
    case 'reasoning':
      return 'reasoning';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    default:
      return 'other';
  }
}

function toModelEntry(
  raw: ModelMetadata,
  availabilityByProvider: Readonly<Record<string, ProviderAvailabilitySignal>>,
): ModelEntry {
  const caps = raw.capabilities;

  return {
    id: raw.id,
    name: raw.name,
    provider: raw.provider,
    availability: availabilityByProvider[raw.provider] ?? AVAILABLE_STATUS,
    category: toCategory(raw.modelType),
    contextWindow: raw.contextWindow ?? null,
    maxOutputTokens: raw.maxOutputTokens ?? null,
    pricing: {
      basis: 'base',
      inputPerMillion: raw.inputCost,
      outputPerMillion: raw.outputCost,
      ...(raw.cached_input === undefined ? {} : { cachedInputPerMillion: raw.cached_input }),
      ...(raw.cached_write === undefined ? {} : { cachedWritePerMillion: raw.cached_write }),
      ...(raw.cached_write_1h === undefined
        ? {}
        : { cachedWrite1hPerMillion: raw.cached_write_1h }),
      inputTokenPricingTiers: (raw.inputTokenPricingTiers ?? []).map((tier) => ({
        thresholdTokens: tier.thresholdTokens,
        inputPerMillion: tier.inputCost,
        outputPerMillion: tier.outputCost,
        ...(tier.cached_input === undefined ? {} : { cachedInputPerMillion: tier.cached_input }),
        ...(tier.cached_write === undefined ? {} : { cachedWritePerMillion: tier.cached_write }),
        ...(tier.cached_write_1h === undefined
          ? {}
          : { cachedWrite1hPerMillion: tier.cached_write_1h }),
      })),
    },
    capabilities: {
      vision: caps.vision,
      tools: caps.tools,
      streaming: caps.streaming,
      thinking: caps.thinking,
      imageGen: caps.imageGen,
      videoGen: caps.videoGen,
      codeExecution: caps.codeExecution,
      search: caps.search,
    },
    speed: raw.speed ?? null,
    quality: raw.quality ?? null,
    bestFor: raw.bestFor,
    released: raw.released ?? null,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  const rateLimitResponse = await withRateLimit(request, 'model-catalog');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const catalog = modelsData as ModelsJson;
    const canonicalModels = listCanonicalModels();
    const availabilityByProvider = await getProviderAvailabilityMap(
      canonicalModels.map((model) => model.provider),
    );
    const models: ModelEntry[] = canonicalModels.map((model) =>
      toModelEntry(model, availabilityByProvider),
    );

    logger.info({ modelCount: models.length }, 'Model catalog served');

    return NextResponse.json(
      {
        models,
        version: String(catalog.version),
        lastUpdated: catalog.lastUpdated,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  } catch (error) {
    logger.error({ error }, 'Failed to serve model catalog');

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to load model catalog',
        },
      },
      {
        status: 500,
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  }
}

export function OPTIONS(request: NextRequest): NextResponse {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
