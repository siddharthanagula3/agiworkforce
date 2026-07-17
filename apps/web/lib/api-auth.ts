import 'server-only';

import type { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { auth } from '@clerk/nextjs/server';
import { ApiKeyService } from '@/lib/services/api-key-service';

export interface AuthResult {
  userId: string;
  email?: string;
}

/**
 * Enforce admin suspension/ban: the admin "suspend-user" action writes
 * profiles.account_status, but until now nothing READ it, so suspended users kept
 * full access. Reject suspended/banned accounts here. Fails OPEN on a lookup error
 * (a DB hiccup must not lock every user out), but a known 'suspended'/'banned'
 * status is always rejected.
 */
export async function assertAccountActive(userId: string): Promise<void> {
  let status: string | null | undefined;
  try {
    const { getNeonDb } = await import('@/lib/server/neon-db');
    const rows = await getNeonDb().query<{ account_status: string | null }>(
      'select account_status from profiles where id = $1 limit 1',
      [userId],
    );
    status = rows[0]?.account_status;
  } catch (lookupError) {
    logger.warn({ error: lookupError, userId }, 'account_status lookup failed; allowing request');
    return;
  }
  if (status === 'suspended' || status === 'banned') {
    throw createError.forbidden('Your account has been suspended. Please contact support.');
  }
}

async function verifyBearerToken(token: string): Promise<AuthResult | null> {
  try {
    const { verifyToken } = await import('@clerk/backend');
    const secretKey = process.env['CLERK_SECRET_KEY'];
    if (secretKey) {
      const claims = await verifyToken(token, { secretKey });
      const sub = claims.sub;
      if (typeof sub === 'string' && sub.length > 0) {
        return {
          userId: sub,
          email: (claims as Record<string, unknown>)['email'] as string | undefined,
        };
      }
    }
  } catch {
    // Not a valid Clerk token
  }

  return null;
}

/**
 * AGI API key (`sk_live_…` / `sk_test_…`, issued via Settings > API Keys),
 * verified through ApiKeyService — Argon2id, O(1) key_prefix lookup,
 * DoS-hardened parse-time rejection. Not a Clerk JWT, so it's checked by
 * prefix and dispatched here BEFORE verifyBearerToken runs, keeping the
 * Clerk bearer path (verifyBearerToken) untouched for every other token.
 */
async function verifyApiKey(token: string): Promise<AuthResult | null> {
  try {
    const apiKey = await ApiKeyService.verifyKey(token);
    if (!apiKey) return null;
    return { userId: apiKey.user_id };
  } catch (error) {
    logger.error({ error }, 'API key verification failed');
    return null;
  }
}

/**
 * WEB-AUTH-BEARER-COOKIE-PRINCIPAL-DIVERGENCE-01: when a request presents a
 * Bearer header, it is AUTHORITATIVE — identity resolves from it (Path 2a or
 * 2b) or the request is rejected. `auth()` (the cookie-session path) is
 * structurally never consulted in that case; there is no code path from
 * "bearer present" back to "fall back to cookie." This closes a divergence
 * where a request carrying a victim's valid session cookie plus an
 * attacker-controlled or merely-stale Bearer header could authenticate as
 * the cookie principal while a CSRF bypass decision (lib/csrf.ts, which
 * verifies the bearer independently) reasoned about the bearer principal —
 * bypass-principal and auth-principal could diverge. They no longer can:
 * both layers now agree that a present bearer must itself verify.
 *
 * Only a request with NO Authorization header at all reaches Path 1.
 */
export async function getClerkAuthUser(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');

  // Path 2: Bearer token (desktop/CLI/mobile/API clients, or a browser
  // request that explicitly attaches one). Present bearer ⇒ authoritative.
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Path 2a: AGI API key — distinguished by prefix, verified via ApiKeyService.
    // Fail-closed: an sk_live_/sk_test_-shaped token that doesn't verify is
    // rejected outright, never falls through to the Clerk JWT path below.
    if (token.startsWith('sk_live_') || token.startsWith('sk_test_')) {
      const result = await verifyApiKey(token);
      if (result) {
        await assertAccountActive(result.userId);
        return result;
      }
      throw createError.unauthorized();
    }

    // Path 2b: Clerk session JWT (unchanged for every non-API-key token)
    const result = await verifyBearerToken(token);
    if (result) {
      await assertAccountActive(result.userId);
      return result;
    }

    // Bearer was present but verified as neither an API key nor a Clerk
    // JWT — reject here. Do NOT fall through to Path 1: a cookie session
    // riding alongside an invalid/stale/forged bearer must not rescue it.
    throw createError.unauthorized();
  }

  // Path 1: Clerk session (browser requests via middleware) — only reached
  // when the request carries no Authorization header at all.
  const { userId } = await auth();
  if (userId) {
    await assertAccountActive(userId);
    return { userId };
  }

  throw createError.unauthorized();
}
