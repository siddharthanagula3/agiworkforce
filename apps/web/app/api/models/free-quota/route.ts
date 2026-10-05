import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  FREE_QUOTA_MEDIA_CATEGORIES,
  type FreeQuotaCatalogue,
  type FreeQuotaLimitedOffer,
} from '@agiworkforce/cloud-contracts';
import { assertAccountActive } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { freeQuotaDayResetsAtMs, readFreeQuotaDailyUse } from '@/lib/free-quota-authorization';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { loadFreePools } from '@/lib/server/free-pools';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import {
  freeQuotaContextFor,
  freeQuotaPlanAdmission,
  type FreeQuotaAdmission,
  type FreeQuotaContext,
} from '@/lib/server/free-quota-catalogue';
import { readSharedFreeQuotaCatalogue } from '@/lib/server/free-quota-catalogue-cache';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

async function limitedOfferFor(
  context: FreeQuotaContext,
  userId: string,
  admissions: readonly (FreeQuotaAdmission | null)[],
): Promise<FreeQuotaLimitedOffer[]> {
  const { store, nowMs } = context;
  if (!store) return [];
  const resetsAt = new Date(freeQuotaDayResetsAtMs(nowMs)).toISOString();
  const offers = await Promise.all(
    admissions.map(async (admission) => {
      if (admission?.terms !== 'limited') return null;
      const { category, dailyCap } = admission;
      try {
        const used = await readFreeQuotaDailyUse(store, { userId, category, nowMs });
        return { category, dailyCap, remainingToday: Math.max(0, dailyCap - used), resetsAt };
      } catch (error) {
        logger.error({ error, category }, '[free-quota] daily use unreadable; offer not listed');
        return null;
      }
    }),
  );
  return offers.filter((offer) => offer !== null);
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'model-catalog');
  if (rateLimitResponse) return rateLimitResponse;
  const scoped = await getUserScopedDb(request, { resolveOrganization: false });
  await assertAccountActive(scoped.userId);
  const planTier = await resolveEntitledPlanTier(scoped.db, scoped.userId);
  const { limitedMediaOffer } = loadFreePools();
  const admitted = {
    chat: freeQuotaPlanAdmission(planTier, 'chat', limitedMediaOffer),
    image: freeQuotaPlanAdmission(planTier, 'image', limitedMediaOffer),
    video: freeQuotaPlanAdmission(planTier, 'video', limitedMediaOffer),
  };
  if (!admitted.chat && !admitted.image && !admitted.video) {
    return NextResponse.json(
      { error: 'No promotional models are available on this plan.' },
      { status: 403, headers: NO_STORE },
    );
  }
  const context = freeQuotaContextFor({ url: request.url, userId: scoped.userId });
  const catalogue = await readSharedFreeQuotaCatalogue(context);
  if (!catalogue) return NextResponse.json(null, { headers: NO_STORE });
  const limitedOffer = await limitedOfferFor(
    context,
    scoped.userId,
    FREE_QUOTA_MEDIA_CATEGORIES.map((category) => admitted[category]),
  );
  const models = catalogue.models.filter(
    (model) => freeQuotaPlanAdmission(planTier, model.category, limitedMediaOffer) !== null,
  );
  const listed = new Set(models.map((model) => model.key));
  const offered: FreeQuotaCatalogue = {
    ...catalogue,
    models,
    mediaUseOrder: (catalogue.mediaUseOrder ?? []).filter((key) => listed.has(key)),
    ...(limitedOffer.length > 0 ? { limitedOffer } : {}),
  };
  return NextResponse.json(offered, { headers: NO_STORE });
}

export const GET = withErrorHandler(handleGet);
