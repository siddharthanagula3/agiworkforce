import { NextRequest, NextResponse } from 'next/server';
import { AUTH_SIGNUP_PATH } from '@/features/auth/authRoutes';
import {
  REFERRAL_ATTRIBUTION_COOKIE,
  REFERRAL_PROGRAM,
  normalizeReferralCode,
} from '@/lib/services/referral-program';

const SECONDS_PER_DAY = 86_400;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await context.params;
  const referralCode = normalizeReferralCode(code);
  const response = NextResponse.redirect(new URL(AUTH_SIGNUP_PATH, request.url));
  if (referralCode) {
    response.cookies.set({
      name: REFERRAL_ATTRIBUTION_COOKIE,
      value: referralCode,
      maxAge: REFERRAL_PROGRAM.attributionDays * SECONDS_PER_DAY,
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
  }
  return response;
}
