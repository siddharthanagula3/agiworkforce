import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import {
  revokeDeveloperSessionFamily,
  revokeDeveloperToken,
  verifyDeveloperTokenSignature,
} from '@/lib/server/developer-token';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { recordAuditEvent } from '@/lib/security-audit';

export const runtime = 'nodejs';

async function handleDeveloperLogout(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'device-link');
  if (rateLimitResponse) return rateLimitResponse;

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const verified = token ? verifyDeveloperTokenSignature(token) : null;
  if (!verified) throw createError.unauthorized();

  const csrfError = await requireCsrfToken(request, verified.userId);
  if (csrfError) return csrfError as NextResponse;

  const [inserted, familyRevoked] = await Promise.all([
    revokeDeveloperToken(verified),
    verified.sessionFamilyId
      ? revokeDeveloperSessionFamily(verified.sessionFamilyId)
      : Promise.resolve(false),
  ]);

  await recordAuditEvent({
    userId: verified.userId,
    eventType: 'logout',
    request,
    detail: {
      source: 'developer_token',
      resourceType: 'session',
      status: inserted || familyRevoked ? 'revoked' : 'already_revoked',
    },
  });

  return NextResponse.json(
    { ok: true, revoked: inserted || familyRevoked },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const POST = withCorsRoute(withErrorHandler(handleDeveloperLogout));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
