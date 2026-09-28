import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import {
  PLAN_LABEL,
  isAutoModeModelId,
  modelsCatalogJson as modelsData,
  normalizeUIPlanTier,
} from '@agiworkforce/types';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import {
  ANONYMOUS_PLAN_TIER,
  buildCatalogueEntries,
  type CatalogueEntry,
  type ModelCatalogueEntry,
} from '@/lib/server/model-catalogue';
import {
  modelKeepsInputsOutOfTraining,
  readProviderTrainingOptOut,
} from '@/lib/server/provider-training-opt-out';

export const runtime = 'nodejs';

export { buildCatalogueEntries };
export type {
  CatalogueEntry,
  ModelCatalogueCapabilities,
  ModelCatalogueEntry,
  ModelCatalogueFreeInventory,
  ModelCatalogueRoute,
  ModelCatalogueRouteStatus,
} from '@/lib/server/model-catalogue';

export interface ModelCatalogueResponse {
  models: ModelCatalogueEntry[];
  count: number;
  planTier: string;
  planLabel: string;
  version: string;
  lastUpdated: string;
}

function toWireEntry(entry: CatalogueEntry): ModelCatalogueEntry {
  const { routes: _routes, provider: _provider, providerLabel: _providerLabel, ...wire } = entry;
  return wire;
}

async function resolveViewer(
  request: NextRequest,
): Promise<{ planTier: string; trainingOptOut: boolean }> {
  let scope: Awaited<ReturnType<typeof getUserScopedDb>>;
  try {
    scope = await getUserScopedDb(request, { resolveOrganization: false });
  } catch {
    return { planTier: ANONYMOUS_PLAN_TIER, trainingOptOut: false };
  }
  const [planTier, trainingOptOut] = await Promise.all([
    resolveEntitledPlanTier(scope.db, scope.userId).catch(() => ANONYMOUS_PLAN_TIER),
    readProviderTrainingOptOut(scope.db, scope.userId).catch((error: unknown) => {
      logger.warn({ error }, 'Training opt-out read failed; listing only no-training models');
      return true;
    }),
  ]);
  return { planTier, trainingOptOut };
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;

  const rateLimitResponse = await withRateLimit(request, 'model-catalog');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const catalog = modelsData as { version: number; lastUpdated: string };
    const { planTier, trainingOptOut } = await resolveViewer(request);
    const models = (await buildCatalogueEntries(planTier))
      .filter(
        (entry) =>
          !trainingOptOut || isAutoModeModelId(entry.id) || modelKeepsInputsOutOfTraining(entry.id),
      )
      .map(toWireEntry);

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

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
