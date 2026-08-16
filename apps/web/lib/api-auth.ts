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
  surfaceClass?: 'developer';
}

export interface AuthOptions {
  apiKeyScope?: ApiKeyScope;
}

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
      surfaceClass: 'developer',
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
