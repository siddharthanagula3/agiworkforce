import 'server-only';

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest, withCorsAndSecurityHeaders } from '@/lib/cors';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { issueDeveloperToken } from '@/lib/server/developer-token';
import {
  createDeviceRefreshCredential,
  DEVICE_REFRESH_TOKEN_EXPIRES_SECONDS,
} from '@/lib/server/device-refresh-token';

// RFC 8628 device-code POLL. Mirrors services/api-gateway deviceAuth.ts `/token`.
// The CLI polls this until the user approves at /auth/device. Status codes are
// part of the contract the CLI client (apps/cli/src/oauth.rs) keys on:
//   403 { error: "authorization_pending" } — not approved yet (keep polling)
//   400 { error: "expired_token" | "access_denied" } — terminal
//   200 { access_token, token_type, expires_in } — approved
//
// On approval we mint the SAME first-party HS256 bearer the gateway mints
// (same claims + JWT_SECRET), so a token issued here is accepted by the gateway
// when the shared secret is configured. The token is IDENTITY-ONLY — it does not
// grant managed-cloud inference/billing, which stay behind their own gates.

export const runtime = 'nodejs';

const TokenPollSchema = z.object({ device_code: z.string().uuid() });

interface DeviceRow {
  device_id: string;
  expires_at: string;
  status: string;
  user_id: string | null;
  user_email: string | null;
}

const noStore = { headers: { 'Cache-Control': 'no-store' } };

async function handleDeviceCodePoll(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'device-poll');
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }
  const parsed = TokenPollSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error);
  }
  const deviceCode = parsed.data.device_code;

  const db = getNeonDb();
  const rows = await db.query<DeviceRow>(
    `SELECT device_id, expires_at, status, user_id, user_email
       FROM device_authorization_codes
      WHERE device_id = $1`,
    [deviceCode],
  );

  if (!rows.length) {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 400, ...noStore });
  }
  const record = rows[0]!;
  const nowIso = new Date().toISOString();

  if (new Date(record.expires_at) < new Date()) {
    await db.execute(
      `UPDATE device_authorization_codes SET status = 'expired', updated_at = $1 WHERE device_id = $2`,
      [nowIso, record.device_id],
    );
    return NextResponse.json({ error: 'expired_token' }, { status: 400, ...noStore });
  }

  if (record.status === 'denied' || record.status === 'revoked') {
    return NextResponse.json({ error: 'access_denied' }, { status: 400, ...noStore });
  }
  if (record.status === 'consumed') {
    return NextResponse.json({ error: 'expired_token' }, { status: 400, ...noStore });
  }
  if (record.status !== 'approved' || !record.user_id) {
    return NextResponse.json({ error: 'authorization_pending' }, { status: 403, ...noStore });
  }

  let accessToken: string;
  let expiresIn: number;
  const familyId = crypto.randomUUID();
  const refreshCredential = createDeviceRefreshCredential();
  try {
    ({ accessToken, expiresIn } = issueDeveloperToken({
      userId: record.user_id,
      ...(record.user_email ? { email: record.user_email } : {}),
      sessionFamilyId: familyId,
    }));
  } catch (error) {
    logger.error({ error }, 'Device token: signing is not configured');
    throw createError.internal('Token signing is not configured');
  }

  // Single-use: mark consumed so a leaked device_code cannot be replayed.
  const consumed = await db.transaction(async (tx) => {
    const consumedRows = await tx.query<{ status: string }>(
      `UPDATE device_authorization_codes
          SET status = 'consumed', consumed_at = $1, updated_at = $1
        WHERE device_id = $2 AND status = 'approved'
        RETURNING status`,
      [nowIso, record.device_id],
    );
    if (!consumedRows.length) return false;

    await tx.execute(
      `INSERT INTO device_refresh_tokens
         (family_id, user_id, user_email, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        familyId,
        record.user_id,
        record.user_email,
        refreshCredential.tokenHash,
        refreshCredential.expiresAt,
      ],
    );
    return true;
  });
  if (!consumed) {
    // Lost the race to another poll that already consumed it.
    return NextResponse.json({ error: 'expired_token' }, { status: 400, ...noStore });
  }

  // Correlation id only — never log the raw device_code (it is the poll secret).
  const deviceRef = crypto
    .createHash('sha256')
    .update(record.device_id + (process.env['LOG_SALT'] ?? ''))
    .digest('hex')
    .slice(0, 12);
  logger.info({ deviceRef, userId: record.user_id }, 'Device token issued');
  return NextResponse.json(
    {
      access_token: accessToken,
      refresh_token: refreshCredential.token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token_expires_in: DEVICE_REFRESH_TOKEN_EXPIRES_SECONDS,
    },
    noStore,
  );
}

const postDeviceCodePoll = withErrorHandler(handleDeviceCodePoll);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = await postDeviceCodePoll(request);
  return withCorsAndSecurityHeaders(response as NextResponse, request);
}

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
