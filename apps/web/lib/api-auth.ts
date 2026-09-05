import 'server-only';

import type { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { setTenantScope } from '@/lib/observability/trace-context';
import { assertMfaPolicy } from '@/lib/mfa-policy-gate';
import { assertIpAllowList } from '@/lib/ip-allow-list-gate';
import { ApiKeyService } from '@/lib/services/api-key-service';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  isDeveloperTokenRevoked,
  verifyDeveloperTokenSignature,
} from '@/lib/server/developer-token';
import { apiKeyHasScope, type ApiKeyScope } from '@/lib/api-key-scopes';
import { ApiKeyScopeError } from '@/lib/api-key-scope-error';
import { getIdentityProvider, getRequestIdentity } from '@/lib/server/identity';
import { resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { getCachedAccountStatus, setCachedAccountStatus } from '@/lib/server/request-context-cache';

export { getClerkAuthorizedParties } from '@/lib/clerk-authorized-parties';

export interface AuthResult {
  userId: string;
  email?: string;
  surfaceClass?: 'developer';
}

export interface AuthOptions {
  apiKeyScope?: ApiKeyScope;
  mfaGateExemptForOwner?: boolean;
}

const EXEMPT_ORGANIZATION_ROLE = 'owner';

async function isExemptOrganizationOwner(userId: string): Promise<boolean> {
  const membership = await resolveOrgMembership(getNeonDb(), userId);
  return membership?.role === EXEMPT_ORGANIZATION_ROLE;
}

/**
 * The MFA gate is the one an organization owner must be able to relax without
 * outside help: enabling `requireMfa` while unenrolled, or the ip allow list
 * excluding the owner's own network, would otherwise leave the workspace with
 * no self-service way to turn the policy back off. Only the caller's own
 * exemption opt-in and the requester actually being an owner skip it; the ip
 * allow list is never exempted here.
 */
async function assertMfaPolicyUnlessExemptOwner(
  userId: string,
  request: NextRequest,
  exempt: boolean,
): Promise<void> {
  if (exempt && (await isExemptOrganizationOwner(userId))) return;
  await assertMfaPolicy(userId, request);
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
  const cachedStatus = await getCachedAccountStatus(userId);
  if (cachedStatus !== undefined) {
    if (cachedStatus === 'suspended' || cachedStatus === 'banned') {
      throw createError.forbidden('Your account has been suspended. Please contact support.');
    }
    return;
  }

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
    const status = rows[0]?.account_status ?? null;
    await setCachedAccountStatus(userId, status);
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
      'account_status lookup failed; ACCOUNT_STATUS_FAIL_OPEN set, allowing request',
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

  const identity = getIdentityProvider();

  let authorizedParties: readonly string[];
  try {
    authorizedParties = identity.authorizedParties();
  } catch (error) {
    logger.error(
      { error },
      'Identity authorized parties are not configured; rejecting bearer token unverified for origin',
    );
    return null;
  }

  const claims = await identity.verifySessionToken(token, { authorizedParties });
  if (claims) {
    return { userId: claims.subject, email: claims.email ?? undefined };
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
        setTenantScope({ userId: result.userId });
        await assertMfaPolicyUnlessExemptOwner(
          result.userId,
          request,
          options.mfaGateExemptForOwner ?? false,
        );
        await assertIpAllowList(result.userId, request);
        return { userId: result.userId };
      }
      throw createError.unauthorized();
    }

    const result = await verifyBearerToken(token);
    if (result) {
      await assertAccountActive(result.userId);
      setTenantScope({ userId: result.userId });
      await assertMfaPolicyUnlessExemptOwner(
        result.userId,
        request,
        options.mfaGateExemptForOwner ?? false,
      );
      await assertIpAllowList(result.userId, request);
      return result;
    }

    throw createError.unauthorized();
  }

  const { subject: userId } = await getRequestIdentity();
  if (userId) {
    await assertAccountActive(userId);
    setTenantScope({ userId });
    await assertMfaPolicyUnlessExemptOwner(userId, request, options.mfaGateExemptForOwner ?? false);
    await assertIpAllowList(userId, request);
    return { userId };
  }

  throw createError.unauthorized();
}
