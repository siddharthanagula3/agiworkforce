import 'server-only';

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';

// RFC 8628 device-code START. Mirrors services/api-gateway deviceAuth.ts `/code`
// but in apps/web's Neon (raw SQL) conventions, so the CLI can complete login
// against the web origin without the (unreachable) api-gateway host.
//
// Unauthenticated by design: the CLI has no session yet. The minted code is
// inert until a signed-in user approves it at /auth/device, which is the trust
// anchor. No invite/subscription gate here — login is open; cloud-MODEL access
// is gated separately at inference time, not at login.

export const runtime = 'nodejs';

const DEVICE_CODE_EXPIRES_SECONDS = 900; // 15 min
const POLL_INTERVAL_SECONDS = 5;

// XXXX-XXXX user code; excludes ambiguous 0/O/1/I/L for readability.
const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars

/** Rejection-sampled to avoid modulo bias (largest multiple of 31 in a byte = 248). */
function generateUserCode(): string {
  const len = USER_CODE_ALPHABET.length;
  const limit = 256 - (256 % len);
  let code = '';
  while (code.length < 8) {
    const bytes = crypto.randomBytes(8 - code.length + 4);
    for (let i = 0; i < bytes.length && code.length < 8; i++) {
      const b = bytes[i]!;
      if (b < limit) code += USER_CODE_ALPHABET[b % len];
    }
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

async function handleDeviceCodeStart(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'device-link');
  if (rateLimitResponse) return rateLimitResponse;

  const deviceCode = crypto.randomUUID();
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_EXPIRES_SECONDS * 1000).toISOString();

  const db = getNeonDb();
  await db.execute(
    `INSERT INTO device_authorization_codes
       (device_id, device_name, device_type, user_code, status, expires_at)
     VALUES ($1, 'AGI CLI', 'cli', $2, 'pending', $3)`,
    [deviceCode, userCode, expiresAt],
  );

  const verificationUri = `${new URL(request.url).origin}/auth/device`;
  // Correlation id only — never log the raw device_code (it is the poll secret).
  const deviceRef = crypto
    .createHash('sha256')
    .update(deviceCode + (process.env['LOG_SALT'] ?? ''))
    .digest('hex')
    .slice(0, 12);
  logger.info({ deviceRef }, 'Device code issued');

  return NextResponse.json(
    {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: `${verificationUri}?user_code=${encodeURIComponent(userCode)}`,
      interval: POLL_INTERVAL_SECONDS,
      expires_in: DEVICE_CODE_EXPIRES_SECONDS,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const POST = withErrorHandler(handleDeviceCodeStart);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
