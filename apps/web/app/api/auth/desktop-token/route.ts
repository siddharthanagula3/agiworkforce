export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { getRequestIdentity } from '@/lib/server/identity';

const TOKEN_TTL_MS = 60 * 1000;

const MIN_KEYSOURCE_BYTES = 64;
const HEX_32_BYTE = /^[0-9a-fA-F]{64}$/;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_SALT = Buffer.from('agiworkforce.desktop-token.v1', 'utf8');

function assertHighEntropyKeysource(name: string, value: string): void {
  const byteLen = Buffer.byteLength(value, 'utf8');
  if (HEX_32_BYTE.test(value)) return;
  if (byteLen < MIN_KEYSOURCE_BYTES) {
    throw new Error(
      `${name} too short: SHA-256 derivation requires >= ${MIN_KEYSOURCE_BYTES} UTF-8 bytes ` +
        '(or a 64-char hex string). Generate with: ' +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  if (/^([\x20-\x7e])\1+$/.test(value)) {
    throw new Error(`${name} appears to be a single repeated character`);
  }
}

function getEncryptionKey(): Buffer {
  const keySource = process.env['TOTP_ENCRYPTION_KEY'] || process.env['DESKTOP_TOKEN_SECRET'];
  if (!keySource) {
    throw new Error('TOTP_ENCRYPTION_KEY or DESKTOP_TOKEN_SECRET environment variable is required');
  }
  const sourceName = process.env['TOTP_ENCRYPTION_KEY']
    ? 'TOTP_ENCRYPTION_KEY'
    : 'DESKTOP_TOKEN_SECRET';
  assertHighEntropyKeysource(sourceName, keySource);
  if (HEX_32_BYTE.test(keySource)) {
    return Buffer.from(keySource, 'hex');
  }
  return crypto.scryptSync(keySource, SCRYPT_SALT, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 128 * 1024 * 1024,
  });
}

function encryptPayload(payload: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(payload, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]);
  return combined.toString('base64url');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'auth-verify');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { subject: userId, getToken } = await getRequestIdentity();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clerkToken = await getToken();

    if (!clerkToken) {
      logger.warn({ userId }, 'Could not retrieve Clerk session token for desktop token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');

    const tokenPayload = {
      session: {
        accessToken: clerkToken,
        refreshToken: null as null,
        user: {
          id: userId,
          email: '',
          name: undefined as string | undefined,
          avatar: undefined as string | undefined,
        },
        expiresAt: now + TOKEN_TTL_MS,
      },
      issuedAt: now,
      expiresAt: now + TOKEN_TTL_MS,
      nonce,
    };

    const encryptedToken = encryptPayload(JSON.stringify(tokenPayload));

    logger.info({ userId }, 'Desktop auth token generated (Clerk auth)');

    return NextResponse.json({
      token: encryptedToken,
      expiresAt: tokenPayload.expiresAt,
      deepLink: `agiworkforce://auth?token=${encodeURIComponent(encryptedToken)}`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to generate desktop auth token');

    if (error instanceof Error && error.message.includes('environment variable')) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
