import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  canUseBillingPlanCapability,
  effectivePlanTier,
  isOrganizationAdminRole,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';
import type { BillingPlanTier } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { SubscriptionService } from '@/lib/services/subscription-service';
import type { DirectorySyncConnectionRow, OrganizationMemberRow } from '@/lib/server/neon-types';
import { ScimError } from './scim-protocol';
import { recordSyncEvent, type ScimConnectionContext } from './scim-provisioning-service';
import { verifyScimToken } from './scim-token-service';

/**
 * Authentication and entitlement for the SCIM service provider.
 *
 * A SCIM request is a machine request from an identity provider. It carries a
 * bearer token that is NOT a Clerk JWT and NOT an `sk_live_` API key, so
 * `getClerkAuthUser` would reject it and `requireCsrfToken` would 403 every
 * mutating call. These routes therefore authenticate themselves, never accept
 * a cookie session, and never fall back to any other credential path.
 *
 * ## The entitlement subject problem
 *
 * `enterprise_controls` is a per-plan capability and subscriptions are
 * per-user (`subscriptions.user_id` is unique; there is no org-level plan).
 * A machine request has no user, so the subject is pinned at mint time:
 * `scim_tokens.created_by_user_id` is the admin who issued the credential, and
 * their entitlement is re-evaluated on EVERY request.
 *
 * That is deliberately strict:
 *   - a lapsed or downgraded subscription stops provisioning immediately,
 *     rather than a cached decision outliving the plan;
 *   - an issuer who is no longer an owner/admin of the organization stops
 *     provisioning too, so a departed admin's credential does not keep
 *     writing memberships.
 *
 * Both refusals are 403 and are written to `directory_sync_events`, so the
 * admin console can explain the outage instead of leaving the IdP to guess.
 */

export interface ScimRequestContext extends ScimConnectionContext {
  db: DatabaseAdapter;
  tokenId: string;
  plan: BillingPlanTier;
  connection: Pick<DirectorySyncConnectionRow, 'id' | 'provider' | 'is_active'>;
}

/**
 * Extract the bearer token. Only the `Authorization: Bearer` header is
 * accepted — never a query parameter, never a cookie. A credential in a query
 * string ends up in access logs.
 */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer[ ]+(\S+)$/u.exec(header.trim());
  return match?.[1] ?? null;
}

const UNAUTHORIZED_DETAIL = 'A valid SCIM bearer token is required';

/**
 * Authenticate a SCIM request and prove the tenant is entitled to use it.
 *
 * Throws `ScimError` on every refusal. All authentication failures collapse to
 * one 401 with one message so a caller cannot distinguish "unknown token" from
 * "revoked token" from "wrong secret".
 */
export async function authenticateScimRequest(request: Request): Promise<ScimRequestContext> {
  const rawToken = extractBearerToken(request);
  if (!rawToken) {
    throw new ScimError(401, UNAUTHORIZED_DETAIL);
  }

  const db = getNeonDb();

  // NOTE: the token itself is never logged, never included in an error detail,
  // and never written to a sync event.
  const verified = await verifyScimToken(db, rawToken);
  if (!verified) {
    throw new ScimError(401, UNAUTHORIZED_DETAIL);
  }

  const ctx: ScimConnectionContext = {
    connectionId: verified.connectionId,
    organizationId: verified.organizationId,
  };

  const connections = await db.query<
    Pick<DirectorySyncConnectionRow, 'id' | 'provider' | 'is_active'>
  >(
    'select id, provider, is_active from directory_sync_connections where id = $1 and organization_id = $2 limit 1',
    [verified.connectionId, verified.organizationId],
  );
  const connection = connections[0];

  if (!connection) {
    // The connection was deleted out from under a token that had not yet been
    // revoked. Fail closed.
    throw new ScimError(401, UNAUTHORIZED_DETAIL);
  }

  if (!connection.is_active) {
    throw new ScimError(403, 'This directory sync connection is disabled', 'mutability');
  }

  // The issuer must still be an owner/admin of the organization this token
  // provisions into.
  //
  // The role predicate is `isOrganizationAdminRole`, not a `role in (...)`
  // literal inside this statement. Which roles administer an organization is a
  // contract shared with the API gateway and the RLS helpers; a copy of the
  // pair spelled out here would keep passing its own tests while the contract
  // moved underneath it. Selecting the membership and judging it in one place
  // also means the authorization decision survives an edit to the query —
  // `(organization_id, user_id)` is the primary key, so at most one row can
  // come back either way.
  const memberships = await db.query<Pick<OrganizationMemberRow, 'role'>>(
    `select role from organization_members
      where organization_id = $1 and user_id = $2
      limit 1`,
    [verified.organizationId, verified.createdByUserId],
  );

  const issuerRole = memberships[0]?.role;

  if (!issuerRole || !isOrganizationAdminRole(issuerRole)) {
    await recordSyncEvent(db, ctx, {
      eventType: 'sync.denied',
      error:
        'The admin who issued this SCIM token is no longer an owner or admin of the organization',
    });
    throw new ScimError(
      403,
      'This SCIM token was issued by an account that no longer administers the organization. Mint a new token.',
    );
  }

  const plan = await resolveEntitlementPlan(db, verified.createdByUserId);

  if (!canUseBillingPlanCapability(plan, 'enterprise_controls')) {
    await recordSyncEvent(db, ctx, {
      eventType: 'sync.denied',
      error: `Directory sync requires an active Enterprise subscription (current plan: ${plan})`,
    });
    logger.warn(
      { organizationId: verified.organizationId, plan },
      'SCIM request refused: organization is not entitled to enterprise controls',
    );
    throw new ScimError(403, 'Directory sync requires an active Enterprise subscription');
  }

  return {
    ...ctx,
    db,
    tokenId: verified.tokenId,
    plan,
    connection,
  };
}

/**
 * Resolve the billing plan for the entitlement subject.
 *
 * Fails CLOSED: a missing subscription row, an expired one, or a lookup error
 * all normalize to a tier that `canUseBillingPlanCapability` refuses. It never
 * throws, because a thrown error here would be indistinguishable from an
 * authentication failure at the call site.
 */
export async function resolveEntitlementPlan(
  db: DatabaseAdapter,
  userId: string,
): Promise<BillingPlanTier> {
  try {
    const subscription = await SubscriptionService.getSubscription(db, userId);
    return normalizeBillingPlanTier(
      effectivePlanTier(subscription?.plan_tier, subscription?.status),
    );
  } catch (error) {
    logger.error({ error }, 'Failed to resolve SCIM entitlement plan; failing closed');
    return normalizeBillingPlanTier(undefined);
  }
}

/**
 * The absolute base URL this service provider is reachable at, used for
 * `meta.location` and for the value an admin pastes into their IdP.
 *
 * Derived from the request rather than an env var so it is correct on preview
 * deployments and localhost without new configuration. The host is taken from
 * the request URL, which Next has already normalized.
 */
export function scimBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/api/scim/v2`;
}
