import 'server-only';

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { getClientIpForRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  REFERRAL_ATTRIBUTION_COOKIE,
  normalizeReferralCode,
} from '@/lib/services/referral-program';
import { referralNetworkHash } from '@/lib/services/referral-signals';
import { attributeReferralSignup } from '@/lib/services/referral-service';

export async function attributeReferralFromRequest(
  request: NextRequest,
  userId: string,
): Promise<void> {
  const cookie = request.cookies.get(REFERRAL_ATTRIBUTION_COOKIE)?.value;
  if (cookie === undefined) return;

  const code = normalizeReferralCode(cookie);
  if (code) {
    try {
      const outcome = await attributeReferralSignup(getNeonDb(), {
        userId,
        code,
        networkHash: referralNetworkHash(getClientIpForRateLimit(request)),
      });
      logger.info({ userId, outcome }, 'Referral attribution evaluated');
    } catch (error) {
      logger.error(
        { error, userId },
        'Referral attribution failed; the attribution cookie is kept so the next request retries',
      );
      return;
    }
  }

  (await cookies()).set({
    name: REFERRAL_ATTRIBUTION_COOKIE,
    value: '',
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}
