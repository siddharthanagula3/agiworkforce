import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { ReferralOverviewResponse } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { getClientIpForRateLimit, withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { getReferralOverview, recordReferrerNetwork } from '@/lib/services/referral-service';
import { referralNetworkHash } from '@/lib/services/referral-signals';

async function handleGetReferrals(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'credits-balance');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });
  await recordReferrerNetwork(db, userId, referralNetworkHash(getClientIpForRateLimit(request)));
  const overview: ReferralOverviewResponse = await getReferralOverview(db, userId);
  return NextResponse.json(overview);
}

export const GET = withErrorHandler(handleGetReferrals);
