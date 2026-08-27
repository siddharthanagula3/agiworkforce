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
import { getClerkAuthorizedParties } from '@/lib/clerk-authorized-parties';

export { getClerkAuthorizedParties } from '@/lib/clerk-authorized-parties';

export interface AuthResult {
  userId: string;
  email?: string;
  surfaceClass?: 'developer';
}

export interface AuthOptions {
  apiKeyScope?: ApiKeyScope;
}

const ACCOUNT_STATUS_ATTEMPTS = 2;

/**
 * Per-attempt ceiling for the account-status lookup.
 *
 * This runs on EVERY cookie-authenticated request and is fail-closed, so its
 * latency is the floor for every click in the product. The only bound the pool
 * offers is `connectionTimeoutMillis` (10s), which means a starved pool used to
 * turn one slow dependency into a twenty-second wait followed by a 503, on
 * pages that have nothing to do with billing.
 */
const ACCOUNT_STATUS_DEADLINE_MS = 2_000;

const DEADLINE_EXCEEDED = Symbol('account-status-deadline');

async function withDeadline<T>(
  work: Promise<T>,
  ms: number,
): Promise<T | typeof DEADLINE_EXCEEDED> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<typeof DEADLINE_EXCEEDED>((resolve) => {
        timer = setTimeout(() => resolve(DEADLINE_EXCEEDED), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function assertAccountActive(userId: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < ACCOUNT_STATUS_ATTEMPTS; attempt++) {
    let rows: { account_status: string | null }[];
    try {
      const raced = await withDeadline(
        getNeonDb().query<{ account_status: string | null }>(
          'select account_status from profiles where id = $1 limit 1',
          [userId],
        ),
        ACCOUNT_STATUS_DEADLINE_MS,
      );
      if (raced === DEADLINE_EXCEEDED) {
        lastError = new Error(`account_status lookup exceeded ${ACCOUNT_STATUS_DEADLINE_MS}ms`);
        continue;
      }
      rows = raced;
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
      surfaceClass: 'developer',
    };
  }

  const secretKey = process.env['CLERK_SECRET_KEY'];
  if (!secretKey) return null;

  let authorizedParties: string[];
  try {
    authorizedParties = getClerkAuthorizedParties();
  } catch (error) {
    logger.error(
      { error },
      'Clerk authorized parties are not configured; rejecting bearer token unverified for origin',
    );
    return null;
  }

  try {
    const { verifyToken } = await import('@clerk/backend');
    const claims = await verifyToken(token, { secretKey, authorizedParties });
    const sub = claims.sub;
    if (typeof sub === 'string' && sub.length > 0) {
      return {
        userId: sub,
        email: (claims as Record<string, unknown>)['email'] as string | undefined,
      };
    }
  } catch {
    // Not a valid Clerk token
  }

  return null;
}

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

export async function getClerkAuthUser(
  request: NextRequest,
  options: AuthOptions = {},
): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

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

    const result = await verifyBearerToken(token);
    if (result) {
      await assertAccountActive(result.userId);
      return result;
    }

    throw createError.unauthorized();
  }

  const { userId } = await auth();
  if (userId) {
    await assertAccountActive(userId);
    return { userId };
  }

  throw createError.unauthorized();
}
