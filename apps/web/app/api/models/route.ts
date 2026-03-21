import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { modelsCatalogJson as modelsData } from '@agiworkforce/types';

/**
 * Model Catalog API
 * Endpoint: GET /api/models
 *
 * Returns the canonical model catalog sourced from @agiworkforce/types (models.json).
 * This is the single source of truth for model metadata consumed by the
 * desktop app, web app, and any external integrations.
 *
 * Response is publicly cacheable (Cache-Control: public, max-age=300) because
 * model metadata changes infrequently (only on model releases/updates).
 */

export const runtime = 'nodejs';

// Capabilities subset exposed in the public API response
interface ModelCapabilities {
  vision: boolean;
  tools: boolean;
  streaming: boolean;
  thinking: boolean;
  imageGen: boolean;
  videoGen: boolean;
  codeExecution: boolean;
  search: boolean;
}

// Pricing in USD per 1M tokens (converted from inputCost/outputCost in models.json)
interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

// Canonical ModelEntry shape returned by this API
export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  category: 'chat' | 'code' | 'reasoning' | 'image' | 'video' | 'other';
  contextWindow: number;
  maxOutputTokens: number | null;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
  speed: string | null;
  quality: string | null;
  bestFor: string[];
  released: string | null;
}

// Raw model shape from models.json
interface RawModel {
  id: string;
  name: string;
  provider: string;
  modelType?: string;
  contextWindow?: number;
  inputCost?: number;
  outputCost?: number;
  capabilities?: {
    streaming?: boolean;
    tools?: boolean;
    vision?: boolean;
    json?: boolean;
    thinking?: boolean;
    computerUse?: boolean;
    agentic?: boolean;
    imageGen?: boolean;
    videoGen?: boolean;
    search?: boolean;
    research?: boolean;
    codeExecution?: boolean;
  };
  speed?: string;
  quality?: string;
  qualityTier?: string;
  bestFor?: string[];
  released?: string;
  apiModelId?: string;
  benchmarks?: Record<string, unknown>;
}

// Full models.json shape (subset we need)
interface ModelsJson {
  version: number;
  lastUpdated: string;
  models: Record<string, RawModel>;
}

/**
 * Map modelType to the category enum expected by clients.
 * The JSON uses 'chat', 'code', 'image', 'video', 'reasoning' — we pass these through
 * and map unknown values to 'other'.
 */
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

/**
 * Transform a raw models.json entry into the public ModelEntry shape.
 */
function toModelEntry(raw: RawModel): ModelEntry {
  const caps = raw.capabilities ?? {};

  return {
    id: raw.id,
    name: raw.name,
    provider: raw.provider,
    category: toCategory(raw.modelType),
    contextWindow: raw.contextWindow ?? 0,
    // models.json does not currently carry a separate maxOutputTokens field;
    // expose null so clients can handle the missing data gracefully.
    maxOutputTokens: null,
    pricing: {
      inputPerMillion: raw.inputCost ?? 0,
      outputPerMillion: raw.outputCost ?? 0,
    },
    capabilities: {
      vision: caps.vision ?? false,
      tools: caps.tools ?? false,
      streaming: caps.streaming ?? false,
      thinking: caps.thinking ?? false,
      imageGen: caps.imageGen ?? false,
      videoGen: caps.videoGen ?? false,
      codeExecution: caps.codeExecution ?? false,
      search: caps.search ?? false,
    },
    speed: raw.speed ?? null,
    quality: raw.quality ?? null,
    bestFor: raw.bestFor ?? [],
    released: raw.released ?? null,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Rate limiting — generous public limit, fail-open
  const rateLimitResponse = await withRateLimit(request, 'model-catalog');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const catalog = modelsData as ModelsJson;
    const rawModels = catalog.models ?? {};

    const models: ModelEntry[] = Object.values(rawModels).map(toModelEntry);

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
          // Public, short-lived cache: CDN/browser caches for 5 minutes.
          // stale-while-revalidate keeps serving cached data while refreshing in the background.
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
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
