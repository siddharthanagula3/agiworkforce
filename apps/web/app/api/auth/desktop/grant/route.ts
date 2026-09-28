import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { createDesktopSignInGrant, isDesktopSignInChallenge } from '@/lib/server/desktop-sign-in';

const GrantSchema = z.object({
  challenge: z.string().refine(isDesktopSignInChallenge, 'Invalid sign-in challenge'),
});

async function handleDesktopSignInGrant(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'device-link');
  if (rateLimitResponse) return rateLimitResponse;

  const authUser = await getClerkAuthUser(request);
  if (authUser.surfaceClass === 'developer') {
    throw createError.forbidden('Signing in the desktop app requires an interactive sign-in.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }
  const parsed = GrantSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error);
  }

  const code = await createDesktopSignInGrant(authUser.userId, parsed.data.challenge);

  await recordAuditEvent({
    userId: authUser.userId,
    eventType: 'device_authorization_approved',
    request,
    detail: { resourceType: 'desktop_sign_in' },
  });

  return NextResponse.json({ code }, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withErrorHandler(handleDesktopSignInGrant);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
