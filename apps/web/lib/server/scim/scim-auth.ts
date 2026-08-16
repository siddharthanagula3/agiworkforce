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

export interface ScimRequestContext extends ScimConnectionContext {
  db: DatabaseAdapter;
  tokenId: string;
  plan: BillingPlanTier;
  connection: Pick<DirectorySyncConnectionRow, 'id' | 'provider' | 'is_active'>;
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer[ ]+(\S+)$/u.exec(header.trim());
  return match?.[1] ?? null;
}

const UNAUTHORIZED_DETAIL = 'A valid SCIM bearer token is required';

export async function authenticateScimRequest(request: Request): Promise<ScimRequestContext> {
  const rawToken = extractBearerToken(request);
  if (!rawToken) {
    throw new ScimError(401, UNAUTHORIZED_DETAIL);
  }

  const db = getNeonDb();

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
    throw new ScimError(401, UNAUTHORIZED_DETAIL);
  }

  if (!connection.is_active) {
    throw new ScimError(403, 'This directory sync connection is disabled', 'mutability');
  }

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

export function scimBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/api/scim/v2`;
}
