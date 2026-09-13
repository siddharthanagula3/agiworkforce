import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { logger } from '@/lib/logger';
import {
  PLAN_LABEL,
  effectivePlanTier,
  modelsCatalogJson as modelsData,
  normalizeUIPlanTier,
} from '@agiworkforce/types';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  ANONYMOUS_PLAN_TIER,
  buildCatalogueEntries,
  type CatalogueEntry,
  type ModelCatalogueEntry,
} from '@/lib/server/model-catalogue';

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
    const models = (await buildCatalogueEntries(planTier)).map(toWireEntry);

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
