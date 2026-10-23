import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { FreeQuotaCatalogue } from '@agiworkforce/cloud-contracts';
import { assertAccountActive } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { freeQuotaContextFor, freeQuotaPlanAdmits } from '@/lib/server/free-quota-catalogue';
import { readSharedFreeQuotaCatalogue } from '@/lib/server/free-quota-catalogue-cache';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

const LISTED_CATEGORIES = ['chat', 'image', 'video'] as const;

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'model-catalog');
  if (rateLimitResponse) return rateLimitResponse;
  const scoped = await getUserScopedDb(request, { resolveOrganization: false });
  await assertAccountActive(scoped.userId);
  const planTier = await resolveEntitledPlanTier(scoped.db, scoped.userId);
  if (!LISTED_CATEGORIES.some((category) => freeQuotaPlanAdmits(planTier, category))) {
    return NextResponse.json(
      { error: 'No promotional models are available on this plan.' },
      { status: 403, headers: NO_STORE },
    );
  }
  const context = freeQuotaContextFor({ url: request.url, userId: scoped.userId });
  const catalogue = await readSharedFreeQuotaCatalogue(context);
  if (!catalogue) return NextResponse.json(null, { headers: NO_STORE });
  const models = catalogue.models.filter((model) => freeQuotaPlanAdmits(planTier, model.category));
  const listed = new Set(models.map((model) => model.key));
  const offered: FreeQuotaCatalogue = {
    ...catalogue,
    models,
    mediaUseOrder: (catalogue.mediaUseOrder ?? []).filter((key) => listed.has(key)),
  };
  return NextResponse.json(offered, { headers: NO_STORE });
}

export const GET = withErrorHandler(handleGet);
