import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest, withCorsAndSecurityHeaders } from '@/lib/cors';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import {
  createDeviceRefreshCredential,
  DEVICE_REFRESH_TOKEN_EXPIRES_SECONDS,
  hashDeviceRefreshToken,
} from '@/lib/server/device-refresh-token';
import { issueDeveloperToken } from '@/lib/server/developer-token';
import { getNeonDb } from '@/lib/server/neon-db';
import { CURRENT_TERMS_VERSION } from '@/lib/server/terms';

export const runtime = 'nodejs';

const RefreshSchema = z.object({
  refresh_token: z.string().min(40).max(512),
});

interface RefreshTokenRow {
  id: string;
  family_id: string;
  user_id: string;
  user_email: string | null;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  device_id: string | null;
  device_name: string | null;
  owner_missing: boolean;
  owner_deletion_scheduled_for: string | null;
  owner_terms_version: string | null;
  owner_terms_accepted_at: string | null;
}

function termsAcceptanceUrl(request: NextRequest, returnTo = '/'): string {
  const url = new URL('/login/complete', new URL(request.url).origin);
  url.searchParams.set('redirectTo', returnTo);
  return url.toString();
}

type RotationResult =
  | {
      kind: 'rotated';
      accessToken: string;
      accessExpiresIn: number;
      refreshToken: string;
    }
  | { kind: 'invalid' | 'expired' | 'replayed' | 'erased' | 'terms_required' };

async function handleDeviceRefresh(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'device-poll');
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => null);
  const parsed = RefreshSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_grant' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const db = getNeonDb();
  const tokenHash = hashDeviceRefreshToken(parsed.data.refresh_token);
  const nowIso = new Date().toISOString();
  const result = await db.transaction<RotationResult>(async (tx) => {
    const rows = await tx.query<RefreshTokenRow>(
      `SELECT t.id, t.family_id, t.user_id, t.user_email, t.expires_at, t.used_at, t.revoked_at,
              t.device_id, t.device_name,
              p.id IS NULL AS owner_missing,
              p.deletion_scheduled_for AS owner_deletion_scheduled_for,
              p.terms_version AS owner_terms_version,
              p.terms_accepted_at AS owner_terms_accepted_at
         FROM device_refresh_tokens t
         LEFT JOIN profiles p ON p.id = t.user_id
        WHERE t.token_hash = $1
        FOR UPDATE OF t`,
      [tokenHash],
    );
    const current = rows[0];
    if (!current) return { kind: 'invalid' };

    if (current.owner_missing || current.owner_deletion_scheduled_for) {
      await tx.execute(
        `UPDATE device_refresh_tokens
            SET revoked_at = COALESCE(revoked_at, $2)
          WHERE family_id = $1`,
        [current.family_id, nowIso],
      );
      return { kind: 'erased' };
    }

    if (current.used_at) {
      await tx.execute(
        `UPDATE device_refresh_tokens
            SET revoked_at = COALESCE(revoked_at, $2)
          WHERE family_id = $1`,
        [current.family_id, nowIso],
      );
      return { kind: 'replayed' };
    }
    if (current.revoked_at) return { kind: 'invalid' };
    if (new Date(current.expires_at) <= new Date()) {
      await tx.execute('UPDATE device_refresh_tokens SET revoked_at = $2 WHERE id = $1', [
        current.id,
        nowIso,
      ]);
      return { kind: 'expired' };
    }

    // A terms revision is a consent gate, not a compromise signal: withhold the token but leave
    // the family intact and unused so the same device resumes once the account re-accepts on web.
    // Revoking here makes every published terms bump destroy every live device session.
    if (current.owner_terms_version !== CURRENT_TERMS_VERSION || !current.owner_terms_accepted_at) {
      return { kind: 'terms_required' };
    }

    const nextCredential = createDeviceRefreshCredential();
    const { accessToken, expiresIn } = issueDeveloperToken({
      userId: current.user_id,
      ...(current.user_email ? { email: current.user_email } : {}),
      sessionFamilyId: current.family_id,
    });
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO device_refresh_tokens
         (family_id, user_id, user_email, token_hash, expires_at, device_id, device_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        current.family_id,
        current.user_id,
        current.user_email,
        nextCredential.tokenHash,
        nextCredential.expiresAt,
        current.device_id,
        current.device_name,
      ],
    );
    const nextId = inserted[0]?.id;
    if (!nextId) throw createError.internal('Could not rotate device session');

    await tx.execute(
      `UPDATE device_refresh_tokens
          SET used_at = $2, replaced_by = $3
        WHERE id = $1
          AND used_at IS NULL
          AND revoked_at IS NULL`,
      [current.id, nowIso, nextId],
    );
    return {
      kind: 'rotated',
      accessToken,
      accessExpiresIn: expiresIn,
      refreshToken: nextCredential.token,
    };
  });

  if (result.kind === 'terms_required') {
    logger.warn(
      { reason: result.kind },
      'Device refresh withheld until current terms are accepted',
    );
    return NextResponse.json(
      {
        error: 'terms_acceptance_required',
        terms_version: CURRENT_TERMS_VERSION,
        acceptance_url: termsAcceptanceUrl(request),
      },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (result.kind !== 'rotated') {
    logger.warn({ reason: result.kind }, 'Device refresh credential rejected');
    return NextResponse.json(
      { error: 'invalid_grant' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      token_type: 'Bearer',
      expires_in: result.accessExpiresIn,
      refresh_token_expires_in: DEVICE_REFRESH_TOKEN_EXPIRES_SECONDS,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const postDeviceRefresh = withErrorHandler(handleDeviceRefresh);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = await postDeviceRefresh(request);
  return withCorsAndSecurityHeaders(response as NextResponse, request);
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
