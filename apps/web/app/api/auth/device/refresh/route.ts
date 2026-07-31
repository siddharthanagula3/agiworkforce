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
}

type RotationResult =
  | {
      kind: 'rotated';
      accessToken: string;
      accessExpiresIn: number;
      refreshToken: string;
    }
  | { kind: 'invalid' | 'expired' | 'replayed' };

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
      `SELECT id, family_id, user_id, user_email, expires_at, used_at, revoked_at
         FROM device_refresh_tokens
        WHERE token_hash = $1
        FOR UPDATE`,
      [tokenHash],
    );
    const current = rows[0];
    if (!current) return { kind: 'invalid' };

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

    const nextCredential = createDeviceRefreshCredential();
    const { accessToken, expiresIn } = issueDeveloperToken({
      userId: current.user_id,
      ...(current.user_email ? { email: current.user_email } : {}),
      sessionFamilyId: current.family_id,
    });
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO device_refresh_tokens
         (family_id, user_id, user_email, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        current.family_id,
        current.user_id,
        current.user_email,
        nextCredential.tokenHash,
        nextCredential.expiresAt,
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
