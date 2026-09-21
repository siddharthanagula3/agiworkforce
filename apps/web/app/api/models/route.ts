import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { logger } from '@/lib/logger';
import {
  getModelAvailability,
  listCanonicalModels,
  modelsCatalogJson as modelsData,
  type ModelAvailability,
  type ModelMetadata,
  type ModelStatus,
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

export type ModelAvailabilityStatus = { state: 'available' } | ProviderAvailabilitySignal;

export interface ModelLifecycle {
  status: ModelStatus;
  deprecated: boolean;
  availability: ModelAvailability;
}

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  category: 'chat' | 'code' | 'reasoning' | 'image' | 'video' | 'other';
  contextWindow: number | null;
  maxOutputTokens: number | null;
  capabilities: ModelCapabilities;
  speed: string | null;
  quality: string | null;
  bestFor: string[];
  released: string | null;
  availability: ModelAvailabilityStatus;
  lifecycle: ModelLifecycle;
}

const DEFAULT_MODEL_STATUS: ModelStatus = 'active';

function toLifecycle(raw: ModelMetadata): ModelLifecycle {
  const status = raw.status ?? (raw.deprecated ? 'deprecated' : DEFAULT_MODEL_STATUS);
  return {
    status,
    deprecated: raw.deprecated === true || status === 'deprecated',
    availability: getModelAvailability(raw),
  };
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
    lifecycle: toLifecycle(raw),
    category: toCategory(raw.modelType),
    contextWindow: raw.contextWindow ?? null,
    maxOutputTokens: raw.maxOutputTokens ?? null,
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
