import 'server-only';

import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { OrganizationPermission } from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { isAdminApiKeyToken, verifyAdminApiKey } from '@/lib/server/admin-api-keys';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireOrgMember, resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
import {
  getTeamAdminAccess,
  requireTeamAdminAccess,
} from '@/app/api/settings/team/team-admin-access';

export const ADMIN_API_KEY_ACTOR_PREFIX = 'admin_api_key:';

export interface ComplianceCaller {
  kind: 'member' | 'admin_api_key';
  db: DatabaseAdapter;
  actorUserId: string;
  organizationId: string;
  role: string;
  keyId: string | null;
}

function bearerToken(request: Request): string | null {
  const match = /^Bearer[ ]+(\S+)$/u.exec(request.headers.get('authorization')?.trim() ?? '');
  return match?.[1] ?? null;
}

export async function resolveComplianceCaller(
  request: NextRequest,
  permission: OrganizationPermission,
  deniedMessage: string,
): Promise<ComplianceCaller> {
  const token = bearerToken(request);
  if (isAdminApiKeyToken(token)) {
    const db = getNeonDb();
    const verified = await verifyAdminApiKey(db, token);
    if (!verified) {
      throw createError.unauthorized('This workspace API key is invalid, expired or revoked.');
    }
    const access = await getTeamAdminAccess(db, '', verified.organizationId);
    if (!access.canManageTeam) {
      throw createError.forbidden(
        'Workspace API keys require an active Team or Enterprise subscription.',
      );
    }
    if (!verified.scopes.has(permission)) {
      throw createError.forbidden(`This workspace API key is not scoped for ${permission}.`);
    }
    return {
      kind: 'admin_api_key',
      db,
      actorUserId: `${ADMIN_API_KEY_ACTOR_PREFIX}${verified.id}`,
      organizationId: verified.organizationId,
      role: 'admin_api_key',
      keyId: verified.id,
    };
  }

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);
  await requireMemberPermission(membership.organizationId, userId, permission, deniedMessage);
  return {
    kind: 'member',
    db,
    actorUserId: userId,
    organizationId: membership.organizationId,
    role: membership.role,
    keyId: null,
  };
}
