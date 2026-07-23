import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { revokeDeveloperToken, verifyDeveloperTokenSignature } from '@/lib/server/developer-token';

export const runtime = 'nodejs';

async function handleDeveloperLogout(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'device-link');
  if (rateLimitResponse) return rateLimitResponse;

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const verified = token ? verifyDeveloperTokenSignature(token) : null;
  if (!verified) throw createError.unauthorized();

  // Credential verification must happen before the CSRF helper is allowed to
  // treat a Bearer request as safe.
  const csrfError = await requireCsrfToken(request, verified.userId);
  if (csrfError) return csrfError as NextResponse;

  const inserted = await revokeDeveloperToken(verified);
  return NextResponse.json(
    { ok: true, revoked: inserted },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const POST = withErrorHandler(handleDeveloperLogout);
