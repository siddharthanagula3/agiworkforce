import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { logger } from '@/lib/logger';
import {
  PLAN_LABEL,
  canAccessModelForSubscriptionTier,
  effectivePlanTier,
  getMinimumRequiredTier,
  getModelAvailability,
  getModelRegistryFacts,
  modelsCatalogJson as modelsData,
  normalizeUIPlanTier,
  type ModelAvailability,
  type ModelEnvironment,
  type ModelMetadata,
} from '@agiworkforce/types';
import {
  MODEL_PICKER_FILTER_CAPABILITIES,
  getModelPriceBand,
  listPickerChatModels,
  type ModelPickerFilterCapability,
  type ModelPickerPriceBand,
} from '@agiworkforce/unified-chat/model-picker';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { SubscriptionService } from '@/lib/services/subscription-service';

export const runtime = 'nodejs';

const ANONYMOUS_PLAN_TIER = 'free';

export type ModelCatalogueCapabilities = Readonly<
  Partial<Record<ModelPickerFilterCapability, boolean>>
>;

export interface ModelCatalogueEntry {
  id: string;
  displayName: string;
  provider: string;
  family: string | null;
  isRouter: boolean;
  releasedOn: string | null;
  stage: string | null;
  openWeight: boolean;
  contextTokens: number | null;
  maxOutputTokens: number | null;
  inputPerMillion: number;
  outputPerMillion: number;
  priceBand: ModelPickerPriceBand | null;
  capabilities: ModelCatalogueCapabilities;
  admitted: boolean;
  minimumPlanLabel: string | null;
  availability: ModelAvailability;
  requiresEnvironment: ModelEnvironment | null;
}

export interface ModelCatalogueResponse {
  models: ModelCatalogueEntry[];
  count: number;
  planTier: string;
  planLabel: string;
  version: string;
  lastUpdated: string;
}

function projectCapabilities(
  capabilities: Readonly<Record<string, boolean | null | undefined>>,
): ModelCatalogueCapabilities {
  return Object.fromEntries(
    MODEL_PICKER_FILTER_CAPABILITIES.map((name) => [name, capabilities[name] === true]),
  ) as ModelCatalogueCapabilities;
}

function toCatalogueEntry(model: ModelMetadata, planTier: string): ModelCatalogueEntry | null {
  const facts = getModelRegistryFacts(model.id);
  if (!facts) return null;
  const admitted = canAccessModelForSubscriptionTier(model.id, planTier);
  const minimumTier = getMinimumRequiredTier(model.id);
  if (!admitted && !minimumTier) return null;
  return {
    id: model.id,
    displayName: model.name,
    provider: model.provider,
    family: facts.family,
    isRouter: facts.isRouter,
    releasedOn: facts.releasedOn,
    stage: facts.stage,
    openWeight: model.openWeight === true,
    contextTokens: model.contextWindow ?? null,
    maxOutputTokens: model.maxOutputTokens ?? null,
    inputPerMillion: model.inputCost,
    outputPerMillion: model.outputCost,
    priceBand: getModelPriceBand(model.id),
    capabilities: projectCapabilities(facts.capabilities),
    admitted,
    minimumPlanLabel: admitted || !minimumTier ? null : PLAN_LABEL[minimumTier],
    availability: getModelAvailability(model),
    requiresEnvironment: model.requiresEnvironment ?? null,
  };
}

async function resolvePlanTier(request: NextRequest): Promise<string> {
  try {
    const { userId } = await getClerkAuthUser(request);
    const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
    const subscription = await SubscriptionService.getSubscription(db, userId);
    return effectivePlanTier(subscription?.plan_tier, subscription?.status);
  } catch {
    return ANONYMOUS_PLAN_TIER;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;

  const rateLimitResponse = await withRateLimit(request, 'model-catalog');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const catalog = modelsData as { version: number; lastUpdated: string };
    const planTier = await resolvePlanTier(request);
    const models = listPickerChatModels()
      .map((model) => toCatalogueEntry(model, planTier))
      .filter((entry): entry is ModelCatalogueEntry => entry !== null);

    logger.info({ modelCount: models.length, planTier }, 'Model catalogue projection served');

    const body: ModelCatalogueResponse = {
      models,
      count: models.length,
      planTier,
      planLabel: PLAN_LABEL[normalizeUIPlanTier(planTier, 'free')],
      version: String(catalog.version),
      lastUpdated: catalog.lastUpdated,
    };

    return NextResponse.json(body, {
      status: 200,
      headers: {
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to serve the model catalogue projection');

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to load the model catalogue' } },
      { status: 500, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
    );
  }
}

export function OPTIONS(request: NextRequest): NextResponse {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
