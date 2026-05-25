/**
 * Desktop Auth Token API
 *
 * POST /api/auth/desktop-token
 *
 * Generates a short-lived (60s) encrypted token containing the user's
 * Clerk session. The web app calls this endpoint, then opens
 * `agiworkforce://auth?token=<encrypted_token>` to transfer the session
 * to the desktop app via deep link.
 *
 * Security:
 * - Requires authenticated Clerk session (Bearer token or cookie)
 * - Token is AES-GCM encrypted with a server-side secret
 * - 60-second TTL prevents replay after window closes
 * - One-time nonce for replay prevention
 * - Rate limited to 5 requests per minute
 */

export const runtime = 'nodejs';

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// Token TTL: 60 seconds
const TOKEN_TTL_MS = 60 * 1000;

// Encryption key derived from TOTP_ENCRYPTION_KEY env var.
// Must be 32 bytes for AES-256-GCM.
//
// FIX (audit 2026-05-20, §13): SEV-WEB-12 / WEB-35 originally accepted SHA-256
// of a passphrase as the KDF; the only mitigation was an entropy gate
// rejecting < 64-byte inputs. SHA-256 is not a password-stretching KDF, so
// once the ciphertext leaked the attacker could grind candidate passphrases
// at hardware speed. This release migrates the KDF to scrypt(N=2^15,r=8,p=1)
// with a fixed app-domain salt — chosen over Argon2id because scrypt ships in
// node:crypto (no native dep), gives raw bytes for direct AES-256-GCM key
// use, and matches the desktop-side derivation we plan to wire up next.
const MIN_KEYSOURCE_BYTES = 64;
const HEX_32_BYTE = /^[0-9a-fA-F]{64}$/;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_N = 1 << 15; // 32768 — matches OWASP minimum, ~64ms on modern CPUs
const SCRYPT_R = 8;
const SCRYPT_P = 1;
// Stable app-domain salt. Changing this value invalidates every previously
// encrypted desktop-token, so coordinate with a desktop release if you do.
const SCRYPT_SALT = Buffer.from('agiworkforce.desktop-token.v1', 'utf8');

function assertHighEntropyKeysource(name: string, value: string): void {
  const byteLen = Buffer.byteLength(value, 'utf8');
  if (HEX_32_BYTE.test(value)) return; // hex 32-byte secret — strong
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
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(payload, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Combine: iv (12 bytes) + authTag (16 bytes) + ciphertext
  const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]);
  return combined.toString('base64url');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  // Rate limit: 5 token generations per minute per IP
  const rateLimitResponse = await withRateLimit(request, 'auth-verify');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // Authenticate via Clerk (handles both cookie sessions and Bearer tokens)
    const { userId, getToken } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Retrieve the Clerk session token to embed in the desktop token payload
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
        // Clerk handles token rotation internally; no separate refresh token needed.
        refreshToken: null as null,
        user: {
          id: userId,
          // Email and display name are not available server-side from auth()
          // without a Clerk API call. The desktop app can decode these from
          // the JWT claims in accessToken if needed.
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
