import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
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
} from '@/lib/server/free-quota-catalogue';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

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
  const decisions = await resolveFreeQuotaDecisions(
    freeQuotaContextFor({ url: request.url, userId: scoped.userId }),
  );
  const catalogue = decisions ? buildFreeQuotaCatalogue(decisions) : null;
  return NextResponse.json(
    catalogue
      ? {
          ...catalogue,
          models: catalogue.models.filter((model) =>
            freeQuotaPlanAllowsOffering(planTier, model.category),
          ),
        }
      : null,
    {
      headers: NO_STORE,
    },
  );
}

export const GET = withErrorHandler(handleGet);
