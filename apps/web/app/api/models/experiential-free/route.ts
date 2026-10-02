import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { assertAccountActive } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { freeQuotaPlanAllows } from '@/lib/server/free-quota-catalogue';
import {
  experientialFreeConfiguration,
  loadExperientialFreeOfferings,
  type ExperientialFreeConfiguration,
  type ExperientialFreeOffering,
} from '@/lib/server/experiential-free';
import {
  RENDER_CACHE_SECONDS,
  RENDER_CACHE_TAGS,
  boundedRenderInput,
} from '@/lib/server/render-cache';
import type { FreeQuotaCatalogue } from '@/features/models/lib/free-quota-types';

export const runtime = 'nodejs';

class UnverifiedPromotions extends Error {}

async function verifiedOfferings(
  config: ExperientialFreeConfiguration,
): Promise<ExperientialFreeOffering[]> {
  const offerings = await loadExperientialFreeOfferings(config);
  if (!offerings) throw new UnverifiedPromotions('Provider promotions could not be verified.');
  return offerings;
}

async function sharedOfferings(
  config: ExperientialFreeConfiguration,
  nowMs: number,
): Promise<ExperientialFreeOffering[] | null> {
  try {
    return await boundedRenderInput(() => verifiedOfferings(config), {
      keyParts: [RENDER_CACHE_TAGS.experientialFreeCatalogue],
      tags: [RENDER_CACHE_TAGS.experientialFreeCatalogue],
      revalidate: RENDER_CACHE_SECONDS.liveSignal,
      nowMs,
    })();
  } catch (error) {
    if (error instanceof UnverifiedPromotions) return null;
    throw error;
  }
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const limit = await withRateLimit(request, 'model-catalog');
  if (limit) return limit;
  const scoped = await getUserScopedDb(request, { resolveOrganization: false });
  await assertAccountActive(scoped.userId);
  const planTier = await resolveEntitledPlanTier(scoped.db, scoped.userId);
  if (!freeQuotaPlanAllows(planTier)) {
    return NextResponse.json({ error: 'Available on the Free plan.' }, { status: 403 });
  }
  const config = experientialFreeConfiguration();
  if (!config)
    return NextResponse.json(null, { headers: { 'Cache-Control': 'private, no-store' } });
  const nowMs = Date.now();
  const offerings = await sharedOfferings(config, nowMs);
  if (!offerings) {
    return NextResponse.json(
      { error: 'Provider promotions could not be verified.' },
      { status: 503 },
    );
  }
  const result: FreeQuotaCatalogue = {
    issuer: 'Experiential Labs',
    observedOn: new Date(nowMs).toISOString().slice(0, 10),
    evidenceUrl: new URL('/api/models', config.baseUrl).href,
    reportedEligible: offerings.filter((entry) => entry.promotional).length,
    reportedUnavailable: offerings.filter((entry) => !entry.promotional).length,
    models: offerings.map(({ key, offering, promotional }) => ({
      key,
      displayName: offering.displayName,
      providerModelId: offering.providerModelId,
      category: 'chat',
      limit: null,
      unit: null,
      consumedApproximate: null,
      expiresOn: null,
      status: promotional ? 'ready' : 'unavailable',
    })),
  };
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withErrorHandler(handleGet);
