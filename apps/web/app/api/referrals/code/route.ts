import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { ReferralCodeResponse } from '@agiworkforce/cloud-contracts';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { getClientIpForRateLimit, withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { referralLink } from '@/lib/services/referral-program';
import { ensureReferralCode } from '@/lib/services/referral-service';
import { referralNetworkHash } from '@/lib/services/referral-signals';

async function handleCreateReferralCode(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'credits-balance');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });
  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse as NextResponse;

  const code = await ensureReferralCode(
    db,
    userId,
    referralNetworkHash(getClientIpForRateLimit(request)),
  );
  const created: ReferralCodeResponse = { code, link: referralLink(code) };
  return NextResponse.json(created);
}

export const POST = withErrorHandler(handleCreateReferralCode);
