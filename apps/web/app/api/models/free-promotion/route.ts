import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  FreeModelPromotionResponseSchema,
  type FreeModelPromotionResponse,
} from '@agiworkforce/cloud-contracts';
import { assertAccountActive } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import {
  freeModelPromotionCoversPlan,
  readFreeModelPromotion,
} from '@/lib/server/free-model-promotion';
import { freeModelPromotionHasCapacity } from '@/lib/server/free-model-promotion-ledger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'model-catalog');
  if (rateLimitResponse) return rateLimitResponse;
  const scoped = await getUserScopedDb(request, { resolveOrganization: false });
  await assertAccountActive(scoped.userId);
  const planTier = await resolveEntitledPlanTier(scoped.db, scoped.userId);
  const nowMs = Date.now();
  const promotion = freeModelPromotionCoversPlan(planTier) ? readFreeModelPromotion(nowMs) : null;
  const offered =
    promotion && (await freeModelPromotionHasCapacity(promotion, nowMs)) ? promotion : null;
  const body: FreeModelPromotionResponse = FreeModelPromotionResponseSchema.parse({
    promotion: offered
      ? { modelId: offered.modelId, endsAt: new Date(offered.endsAtMs).toISOString() }
      : null,
  });
  return NextResponse.json(body, { headers: NO_STORE });
}

export const GET = withErrorHandler(handleGet);
