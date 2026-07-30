import 'server-only';

import type { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { auth } from '@clerk/nextjs/server';
import { ApiKeyService } from '@/lib/services/api-key-service';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  isDeveloperTokenRevoked,
  verifyDeveloperTokenSignature,
} from '@/lib/server/developer-token';
import { apiKeyHasScope, type ApiKeyScope } from '@/lib/api-key-scopes';
import { ApiKeyScopeError } from '@/lib/api-key-scope-error';

export interface AuthResult {
  userId: string;
  email?: string;
}

export interface AuthOptions {
  /**
   * API keys are denied unless the caller names the public-API capability this
   * route requires. Clerk sessions and first-party developer tokens are
   * unaffected.
   */
  apiKeyScope?: ApiKeyScope;
}

/**
 * Enforce admin suspension/ban: the admin "suspend-user" action writes
 * profiles.account_status, and this is the read that enforces it. A known
 * 'suspended'/'banned' status is always rejected.
 *
 * Failure posture — fail CLOSED (503) after a bounded retry. The earlier
 * fail-open behavior let a suspended/banned user regain full access during any
 * transient DB error, which is exactly when a just-suspended abuser would retry.
 * This also diverged from the managed-compute gateway, which already fails
 * closed. Because every API route this guards is DB-backed, a sustained Neon
 * outage already breaks those routes — denying auth during one does not remove
 * otherwise-working functionality, it just returns an honest 503 instead of
 * silently granting access. A single retry absorbs one-off blips so normal
 * requests are unaffected.
 *
 * Escape hatch: set ACCOUNT_STATUS_FAIL_OPEN=1 to restore fail-open if an
 * incident ever makes that the lesser evil (documented, opt-in, off by default).
 */
export async function assertAccountActive(userId: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let rows: { account_status: string | null }[];
    try {
      rows = await getNeonDb().query<{ account_status: string | null }>(
        'select account_status from profiles where id = $1 limit 1',
        [userId],
      );
    } catch (lookupError) {
      lastError = lookupError;
      continue;
    }
    const status = rows[0]?.account_status;
    if (status === 'suspended' || status === 'banned') {
      throw createError.forbidden('Your account has been suspended. Please contact support.');
    }
    return;
  }

  const failOpen = ['1', 'true', 'on'].includes(
    (process.env['ACCOUNT_STATUS_FAIL_OPEN'] ?? '').toLowerCase(),
  );
  if (failOpen) {
    logger.error(
      { error: lastError, userId },
      'account_status lookup failed; ACCOUNT_STATUS_FAIL_OPEN set — allowing request',
    );
    return;
  }
  logger.error(
    { error: lastError, userId },
    'account_status lookup failed after retry; denying request (fail-closed)',
  );
  throw createError.serviceUnavailable(
    'Unable to verify account status. Please try again shortly.',
  );
}

/**
 * Origins allowed to mint the session tokens we accept, validated against the
 * JWT `azp` (authorized party) claim. Without this, a token minted by the same
 * Clerk instance for a DIFFERENT authorized origin would still verify here.
 * Comma-separated env `CLERK_AUTHORIZED_PARTIES` (e.g.
 * "https://agiworkforce.com,https://www.agiworkforce.com"). When unset the
 * check is skipped (behavior unchanged) so this is safe to ship before the env
 * is configured; set it in production to enforce azp binding.
 */
function getClerkAuthorizedParties(): string[] {
  return (process.env['CLERK_AUTHORIZED_PARTIES'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function verifyBearerToken(token: string): Promise<AuthResult | null> {
  const developerToken = verifyDeveloperTokenSignature(token);
  if (developerToken) {
    try {
      if (await isDeveloperTokenRevoked(developerToken)) return null;
    } catch (error) {
      logger.error(
        { error, userId: developerToken.userId },
        'Developer token revocation lookup failed; denying request',
      );
      throw createError.serviceUnavailable(
        'Unable to verify device session. Please try again shortly.',
      );
    }
    return {
      userId: developerToken.userId,
      ...(developerToken.email ? { email: developerToken.email } : {}),
    };
  }

  try {
    const { verifyToken } = await import('@clerk/backend');
    const secretKey = process.env['CLERK_SECRET_KEY'];
    if (secretKey) {
      const authorizedParties = getClerkAuthorizedParties();
      const claims = await verifyToken(token, {
        secretKey,
        ...(authorizedParties.length > 0 ? { authorizedParties } : {}),
      });
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
 * DoS-hardened parse-time rejection. Not a JWT, so it's checked by
 * prefix and dispatched here BEFORE verifyBearerToken runs, keeping the
 * JWT bearer path (verifyBearerToken) untouched for every other token.
 */
async function verifyApiKey(
  token: string,
): Promise<(AuthResult & { scopes: readonly string[] }) | null> {
  try {
    const apiKey = await ApiKeyService.verifyKey(token);
    if (!apiKey) return null;
    return { userId: apiKey.user_id, scopes: apiKey.scopes };
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
export async function getClerkAuthUser(
  request: NextRequest,
  options: AuthOptions = {},
): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');

  // Path 2: Bearer token (desktop/CLI/mobile/API clients, or a browser
  // request that explicitly attaches one). Present bearer ⇒ authoritative.
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Path 2a: AGI API key — distinguished by prefix, verified via ApiKeyService.
    // Fail-closed: an sk_live_/sk_test_-shaped token that doesn't verify is
    // rejected outright, never falls through to a JWT path below.
    if (token.startsWith('sk_live_') || token.startsWith('sk_test_')) {
      const result = await verifyApiKey(token);
      if (result) {
        if (!options.apiKeyScope) {
          throw new ApiKeyScopeError('API keys are not permitted for this endpoint');
        }
        if (!apiKeyHasScope(result.scopes, options.apiKeyScope)) {
          throw new ApiKeyScopeError('API key does not have the required scope');
        }
        await assertAccountActive(result.userId);
        return { userId: result.userId };
      }
      throw createError.unauthorized();
    }

    // Path 2b: Clerk session JWT or first-party developer device token.
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
