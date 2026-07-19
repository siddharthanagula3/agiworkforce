import 'server-only';

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';

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

const ACCESS_TOKEN_EXPIRES_SECONDS = 604800; // 7 days (matches gateway)

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

  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    logger.error({}, 'Device token: JWT_SECRET is not configured');
    throw createError.internal('Token signing is not configured');
  }

  // Reuse the gateway's exact token contract (services/api-gateway/.../deviceAuth.ts):
  // same claims + JWT_SECRET, so a token minted here is accepted by the gateway.
  // `surface: 'developer'` marks this as a device-authorization (CLI/IDE)
  // credential; the gateway's managed plan gate reads it as the TRUSTED
  // developer-surface class so managed developer access requires Pro or higher.
  const accessToken = jwt.sign(
    { userId: record.user_id, email: record.user_email ?? '', surface: 'developer' },
    secret,
    {
      expiresIn: ACCESS_TOKEN_EXPIRES_SECONDS,
      issuer: 'agiworkforce-api-gateway',
      audience: 'agiworkforce',
      jwtid: crypto.randomUUID(),
    },
  );

  // Single-use: mark consumed so a leaked device_code cannot be replayed.
  const consumed = await db.query<{ status: string }>(
    `UPDATE device_authorization_codes
        SET status = 'consumed', consumed_at = $1, updated_at = $1
      WHERE device_id = $2 AND status = 'approved'
      RETURNING status`,
    [nowIso, record.device_id],
  );
  if (!consumed.length) {
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
    { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_EXPIRES_SECONDS },
    noStore,
  );
}

export const POST = withErrorHandler(handleDeviceCodePoll);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
