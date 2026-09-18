import 'server-only';

import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { OrganizationPermission } from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  requirePermission,
  resolveOrganizationAccess,
  type OrganizationAccess,
} from '@/lib/services/organization-permission-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';

export interface WorkspaceConsoleAccess {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string;
  access: OrganizationAccess;
}

export async function resolveWorkspaceConsoleAccess(
  request: NextRequest,
): Promise<WorkspaceConsoleAccess> {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  if (!organizationId) {
    throw createError.forbidden('Select a workspace first.').asUserSafe();
  }
  await requireTeamAdminAccess(db, userId, organizationId);
  const access = await resolveOrganizationAccess(organizationId, userId);
  if (!access) {
    throw createError.forbidden('You are not a member of this workspace.').asUserSafe();
  }
  return { db, userId, organizationId, access };
}

export async function requireWorkspaceConsolePermission(
  request: NextRequest,
  permission: OrganizationPermission,
  deniedMessage: string,
): Promise<WorkspaceConsoleAccess> {
  const resolved = await resolveWorkspaceConsoleAccess(request);
  requirePermission(resolved.access, permission, deniedMessage);
  return resolved;
}
