import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  isDesktopSignInCode,
  isDesktopSignInVerifier,
  mintDesktopSignInTicket,
  redeemDesktopSignInGrant,
} from '@/lib/server/desktop-sign-in';

const RedeemSchema = z.object({
  code: z.string().refine(isDesktopSignInCode, 'Invalid sign-in code'),
  verifier: z.string().refine(isDesktopSignInVerifier, 'Invalid sign-in verifier'),
});

async function handleDesktopSignInRedeem(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'device-code-lookup');
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }
  const parsed = RedeemSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error);
  }

  const userId = await redeemDesktopSignInGrant(parsed.data.code, parsed.data.verifier);
  if (!userId) {
    throw createError.notFound(
      'This sign-in has expired or was already used. Start signing in again from the desktop app.',
    );
  }

  const ticket = await mintDesktopSignInTicket(userId);

  await recordAuditEvent({
    userId,
    eventType: 'login',
    request,
    detail: { resourceType: 'desktop_sign_in' },
  });

  return NextResponse.json({ ticket }, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withErrorHandler(handleDesktopSignInRedeem);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
