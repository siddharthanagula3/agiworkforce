import 'server-only';

import type { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { logAuthFailure } from '@/lib/security-audit';
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
import {
  resolveAuthenticatedAccount,
  type AuthenticatedAccount,
} from '@/lib/server/identity-account';
import { accountAccessDecision, type AccountStatus } from '@/lib/auth/account-status';
import { readAccountStatus } from '@/lib/auth/account-lifecycle';
import { resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';
import { assertTenantNotLockedDown } from '@/lib/feature-flags/tenant-lockdown';
import { getCachedAccountStatus, setCachedAccountStatus } from '@/lib/server/request-context-cache';
import { bindSurfaceFromClaims, type BoundSurface } from '@/lib/free-chat-surface-policy';

export { getClerkAuthorizedParties } from '@/lib/clerk-authorized-parties';

/**
 * `userId` is this product's own account id, resolved through the identities
 * bridge (0174); `identityId` is the one (provider, subject) pair it came from.
 */
export interface AuthResult {
  userId: string;
  identityId?: string;
  email?: string;
  surfaceClass?: 'developer';
  boundSurface?: BoundSurface;
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
async function assertMfaPolicyUnlessExemptOwner(userId: string, exempt: boolean): Promise<void> {
  if (exempt && (await isExemptOrganizationOwner(userId))) return;
  await assertMfaPolicy(userId);
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

function assertStatusAllowsAccess(status: string | null): void {
  const decision = accountAccessDecision(status);
  if (decision.allowed) return;
  throw createError.forbidden(decision.message);
}

/**
 * A workspace locked down during an incident reaches no route. Resolution
 * failures answer "not locked", which is the contract tenant-lockdown.ts states:
 * the switch can only ever take something down deliberately.
 */
async function assertWorkspaceNotLockedDown(userId: string, request?: NextRequest): Promise<void> {
  let organizationId: string | null = null;
  try {
    const resolved = await withDeadline(
      resolveActiveOrganizationId(getNeonDb(), userId, request),
      ACCOUNT_STATUS_DEADLINE_MS,
    );
    if (resolved !== DEADLINE_EXCEEDED) organizationId = resolved;
  } catch (error) {
    logger.warn({ error, userId }, 'workspace lookup for the lockdown gate failed; not locked');
  }
  await assertTenantNotLockedDown(organizationId);
}

export async function assertAccountActive(userId: string, request?: NextRequest): Promise<void> {
  await assertAccountLifecycleActive(userId);
  await assertWorkspaceNotLockedDown(userId, request);
}

async function assertAccountLifecycleActive(userId: string): Promise<void> {
  const cachedStatus = await getCachedAccountStatus(userId);
  if (cachedStatus !== undefined) {
    assertStatusAllowsAccess(cachedStatus);
    return;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < ACCOUNT_STATUS_ATTEMPTS; attempt++) {
    let status: AccountStatus | null;
    try {
      const raced = await withDeadline(readAccountStatus(userId), ACCOUNT_STATUS_DEADLINE_MS);
      if (raced === DEADLINE_EXCEEDED) {
        lastError = new Error(`account_status lookup exceeded ${ACCOUNT_STATUS_DEADLINE_MS}ms`);
        continue;
      }
      status = raced;
    } catch (lookupError) {
      lastError = lookupError;
      continue;
    }
    await setCachedAccountStatus(userId, status);
    assertStatusAllowsAccess(status);
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

/**
 * Erasure deletes the profile row, so erasure_tombstones (0103) is the only
 * record that can turn away a provider callback still holding the old subject.
 */
async function accountForSubject(
  subject: string,
  request: NextRequest,
): Promise<AuthenticatedAccount | null> {
  const resolution = await resolveAuthenticatedAccount(subject);
  if (resolution.outcome === 'resolved') return resolution.account;
  if (resolution.outcome === 'erased') {
    await logAuthFailure(request, 'erased_account', resolution.accountId);
  }
  return null;
}

function authResultFor(account: AuthenticatedAccount, email?: string | null): AuthResult {
  return {
    userId: account.accountId,
    ...(account.identityId ? { identityId: account.identityId } : {}),
    ...(email ? { email } : {}),
  };
}

async function verifyBearerToken(token: string, request: NextRequest): Promise<AuthResult | null> {
  const developerToken = verifyDeveloperTokenSignature(token);
  if (developerToken) {
    try {
      if (await isDeveloperTokenRevoked(developerToken)) {
        await logAuthFailure(request, 'revoked_developer_token', developerToken.userId);
        return null;
      }
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
    const account = await accountForSubject(claims.subject, request);
    if (!account) return null;
    const boundSurface = bindSurfaceFromClaims(claims.raw);
    return {
      ...authResultFor(account, claims.email),
      ...(boundSurface ? { boundSurface } : {}),
    };
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
        await assertAccountActive(result.userId, request);
        setTenantScope({ userId: result.userId });
        await assertMfaPolicyUnlessExemptOwner(
          result.userId,
          options.mfaGateExemptForOwner ?? false,
        );
        await assertIpAllowList(result.userId, request);
        return { userId: result.userId };
      }
      await logAuthFailure(request, 'invalid_api_key');
      throw createError.unauthorized();
    }

    const result = await verifyBearerToken(token, request);
    if (result) {
      await assertAccountActive(result.userId, request);
      setTenantScope({ userId: result.userId });
      await assertMfaPolicyUnlessExemptOwner(result.userId, options.mfaGateExemptForOwner ?? false);
      await assertIpAllowList(result.userId, request);
      return result;
    }

    throw createError.unauthorized();
  }

  const { subject } = await getRequestIdentity();
  const account = subject === null ? null : await accountForSubject(subject, request);
  if (account) {
    const userId = account.accountId;
    await assertAccountActive(userId, request);
    setTenantScope({ userId });
    await assertMfaPolicyUnlessExemptOwner(userId, options.mfaGateExemptForOwner ?? false);
    await assertIpAllowList(userId, request);
    return authResultFor(account);
  }

  throw createError.unauthorized();
}
