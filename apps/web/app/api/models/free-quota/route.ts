import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { FreeQuotaCatalogue } from '@agiworkforce/cloud-contracts';
import { providerOfferingDisplayName } from '@agiworkforce/types';
import { assertAccountActive } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import {
  buildFreeQuotaCatalogue,
  freeQuotaContextFor,
  freeQuotaPlanAllows,
  freeQuotaPlanAllowsOffering,
  resolveFreeQuotaDecisions,
  type FreeQuotaContext,
} from '@/lib/server/free-quota-catalogue';
import {
  RENDER_CACHE_SECONDS,
  RENDER_CACHE_TAGS,
  cachedRenderInput,
} from '@/lib/server/render-cache';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

async function readCatalogue(context: FreeQuotaContext): Promise<FreeQuotaCatalogue | null> {
  const decisions = await resolveFreeQuotaDecisions(context);
  if (!decisions) return null;
  const catalogue = buildFreeQuotaCatalogue(decisions);
  return {
    ...catalogue,
    models: catalogue.models.map((model) => ({
      ...model,
      displayName: providerOfferingDisplayName(model.key) ?? model.displayName,
    })),
  };
}

function sharedCatalogue(context: FreeQuotaContext): Promise<FreeQuotaCatalogue | null> {
  if (context.localAttestation) return readCatalogue(context);
  return cachedRenderInput(() => readCatalogue(context), {
    keyParts: [RENDER_CACHE_TAGS.freeQuotaCatalogue],
    tags: [RENDER_CACHE_TAGS.freeQuotaCatalogue],
    revalidate: RENDER_CACHE_SECONDS.liveSignal,
  })();
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'model-catalog');
  if (rateLimitResponse) return rateLimitResponse;
  const scoped = await getUserScopedDb(request, { resolveOrganization: false });
  await assertAccountActive(scoped.userId);
  const planTier = await resolveEntitledPlanTier(scoped.db, scoped.userId);
  const freePlan = freeQuotaPlanAllows(planTier);
  if (
    !freePlan &&
    !freeQuotaPlanAllowsOffering(planTier, 'image') &&
    !freeQuotaPlanAllowsOffering(planTier, 'video')
  ) {
    return NextResponse.json(
      { error: 'No promotional models are available on this plan.' },
      { status: 403, headers: NO_STORE },
    );
  }
  const catalogue = await sharedCatalogue(
    freeQuotaContextFor({ url: request.url, userId: scoped.userId }),
  );
  const offered: FreeQuotaCatalogue | null = catalogue
    ? {
        ...catalogue,
        models: catalogue.models.filter((model) =>
          freeQuotaPlanAllowsOffering(planTier, model.category),
        ),
      }
    : null;
  return NextResponse.json(offered, { headers: NO_STORE });
}

export const GET = withErrorHandler(handleGet);
