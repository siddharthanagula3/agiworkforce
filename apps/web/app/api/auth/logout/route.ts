import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import {
  revokeDeveloperSessionFamily,
  revokeDeveloperToken,
  verifyDeveloperTokenSignature,
} from '@/lib/server/developer-token';
import { hashDeviceRefreshToken } from '@/lib/server/device-refresh-token';
import { getNeonDb } from '@/lib/server/neon-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { recordAuditEvent } from '@/lib/security-audit';

export const runtime = 'nodejs';

const RevokeSchema = z.object({
  refresh_token: z.string().min(40).max(512),
});

async function revokeByRefreshToken(
  request: NextRequest,
  refreshToken: string,
): Promise<NextResponse> {
  const [family] = await getNeonDb().query<{ family_id: string; user_id: string }>(
    `SELECT family_id, user_id FROM device_refresh_tokens WHERE token_hash = $1`,
    [hashDeviceRefreshToken(refreshToken)],
  );
  if (!family) {
    return NextResponse.json(
      { ok: true, revoked: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const revoked = await revokeDeveloperSessionFamily(family.family_id);
  await recordAuditEvent({
    userId: family.user_id,
    eventType: 'logout',
    request,
    detail: {
      source: 'device_refresh_token',
      resourceType: 'session',
      status: revoked ? 'revoked' : 'already_revoked',
    },
  });
  return NextResponse.json({ ok: true, revoked }, { headers: { 'Cache-Control': 'no-store' } });
}

async function handleDeveloperLogout(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'device-link');
  if (rateLimitResponse) return rateLimitResponse;

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const verified = token ? verifyDeveloperTokenSignature(token) : null;
  if (!verified) {
    const body = RevokeSchema.safeParse(await request.json().catch(() => null));
    if (body.success) return revokeByRefreshToken(request, body.data.refresh_token);
    throw createError.unauthorized();
  }

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
