import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { logSecurityEvent } from '@/lib/security-audit';
import type { OrganizationMemberRow } from '@/lib/server/neon-types';
import { requireSSOAdminAccess, type SSOAdminAccess } from './sso-access';

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface SSOPrincipal {
  userId: string;
  access: SSOAdminAccess;
  db: DatabaseAdapter;
}

export async function authorizeSSORequest(
  request: NextRequest,
  endpoint: string,
): Promise<{ principal: SSOPrincipal; response: null } | { principal: null; response: Response }> {
  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch (error) {
    logger.warn({ error, endpoint }, 'Unauthorized SSO request');
    return {
      principal: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const db = getNeonDb();
  const { access, denial } = await requireSSOAdminAccess(db, userId);

  if (denial) {
    await logSecurityEvent({
      userId,
      eventType: 'authorization_failed',
      severity: 'low',
      endpoint,
      details: { action: 'sso-entitlement-denied', plan: access.plan },
    });
    return {
      principal: null,
      response: NextResponse.json(denial.body, { status: denial.status }),
    };
  }

  return { principal: { userId, access, db }, response: null };
}

export async function getOrgRole(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string,
): Promise<OrgRole | null> {
  const rows = await db.query<Pick<OrganizationMemberRow, 'role'>>(
    'select role from organization_members where organization_id = $1 and user_id = $2 limit 1',
    [organizationId, userId],
  );

  if (rows.length === 0) {
    return null;
  }

  return (rows[0]!.role as OrgRole) ?? null;
}

export async function requireOrgRole(
  principal: SSOPrincipal,
  organizationId: string,
  allowed: readonly OrgRole[],
  endpoint: string,
  action: string,
): Promise<Response | null> {
  const role = await getOrgRole(principal.db, principal.userId, organizationId);

  if (!role || !allowed.includes(role)) {
    logger.warn(
      { userId: principal.userId, organizationId, required: allowed },
      'Caller lacks the required organization role for SSO',
    );
    await logSecurityEvent({
      userId: principal.userId,
      eventType: 'authorization_failed',
      severity: 'medium',
      endpoint,
      details: { action, organization_id: organizationId, required_roles: allowed },
    });
    return NextResponse.json(
      {
        error: allowed.includes('admin')
          ? 'Forbidden: organization owner or admin role required'
          : 'Forbidden: only organization owners can change SSO connections',
      },
      { status: 403 },
    );
  }

  return null;
}

export function ssoErrorResponse(error: unknown, context: Record<string, unknown>): Response {
  logger.error({ error, ...context }, 'Unexpected error in SSO route');
  if (error instanceof Error && error.message.includes('fetch failed')) {
    return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
