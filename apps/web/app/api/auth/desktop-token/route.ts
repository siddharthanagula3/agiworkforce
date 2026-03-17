/**
 * Desktop Auth Token API
 *
 * POST /api/auth/desktop-token
 *
 * Generates a short-lived (60s) encrypted token containing the user's
 * Supabase session. The web app calls this endpoint, then opens
 * `agiworkforce://auth?token=<encrypted_token>` to transfer the session
 * to the desktop app via deep link.
 *
 * Security:
 * - Requires authenticated Supabase session (Bearer token or cookie)
 * - Token is AES-GCM encrypted with a server-side secret
 * - 60-second TTL prevents replay after window closes
 * - One-time nonce for replay prevention
 * - Rate limited to 5 requests per minute
 */

import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// Token TTL: 60 seconds
const TOKEN_TTL_MS = 60 * 1000;

// Encryption key derived from TOTP_ENCRYPTION_KEY env var
// Must be 32 bytes for AES-256-GCM
function getEncryptionKey(): Buffer {
  const keySource = process.env['TOTP_ENCRYPTION_KEY'] || process.env['DESKTOP_TOKEN_SECRET'];
  if (!keySource) {
    throw new Error('TOTP_ENCRYPTION_KEY or DESKTOP_TOKEN_SECRET environment variable is required');
  }
  // Derive a 32-byte key using SHA-256
  return crypto.createHash('sha256').update(keySource).digest();
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
  // Rate limit: 5 token generations per minute per IP
  const rateLimitResponse = await withRateLimit(request, 'auth-verify');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

    if (!supabaseUrl || !supabaseAnonKey) {
      logger.error({}, 'Supabase environment variables not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Authenticate the user via Bearer token or cookies
    let accessToken: string | null = null;
    let refreshToken: string | null = null;

    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7);

      // Validate the token
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, flowType: 'pkce' },
      });

      const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
      if (userError || !userData.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // We need the session to get the refresh token
      // When using Bearer auth, the client must provide the refresh token in the body
      const body = await request.json().catch(() => ({}));
      refreshToken = (body as Record<string, string>)['refreshToken'] || null;

      if (!refreshToken) {
        return NextResponse.json(
          { error: 'refreshToken is required in the request body' },
          { status: 400 },
        );
      }

      const now = Date.now();
      const nonce = crypto.randomBytes(16).toString('hex');

      const tokenPayload = {
        session: {
          accessToken,
          refreshToken,
          user: {
            id: userData.user.id,
            email: userData.user.email || '',
            name: userData.user.user_metadata?.['full_name'] as string | undefined,
            avatar: userData.user.user_metadata?.['avatar_url'] as string | undefined,
          },
          expiresAt: now + TOKEN_TTL_MS,
        },
        issuedAt: now,
        expiresAt: now + TOKEN_TTL_MS,
        nonce,
      };

      const encryptedToken = encryptPayload(JSON.stringify(tokenPayload));

      logger.info({ userId: userData.user.id }, 'Desktop auth token generated (Bearer auth)');

      return NextResponse.json({
        token: encryptedToken,
        expiresAt: tokenPayload.expiresAt,
        deepLink: `agiworkforce://auth?token=${encodeURIComponent(encryptedToken)}`,
      });
    }

    // Cookie-based auth (for web app dashboard)
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      auth: { flowType: 'pkce' },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // ignore — read-only context
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // ignore
          }
        },
      },
    });

    // Use getUser() instead of getSession() to force server-side JWT re-verification.
    // getSession() reads from the cookie without re-validating with Supabase's auth server,
    // which means a tampered or expired token could pass. getUser() makes a network call
    // to verify the token is still valid.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Still need the session to get the refresh token for the desktop token payload
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = sessionData.session;

    // Guard against race condition: the session may have expired between
    // the getUser() JWT verification and the getSession() cookie read.
    // expires_at is a Unix timestamp in seconds.
    if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
      logger.warn({ userId: userData.user.id }, 'Session expired between getUser and getSession');
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    const now = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');

    const tokenPayload = {
      session: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        user: {
          id: userData.user.id,
          email: userData.user.email || '',
          name: userData.user.user_metadata?.['full_name'] as string | undefined,
          avatar: userData.user.user_metadata?.['avatar_url'] as string | undefined,
        },
        expiresAt: now + TOKEN_TTL_MS,
      },
      issuedAt: now,
      expiresAt: now + TOKEN_TTL_MS,
      nonce,
    };

    const encryptedToken = encryptPayload(JSON.stringify(tokenPayload));

    logger.info({ userId: userData.user.id }, 'Desktop auth token generated (cookie auth)');

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
