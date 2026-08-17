import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, logSecurityEvent } from '@/lib/security-audit';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import { readJsonBody } from '@/lib/read-json-body';
import type { ScimGroupRow } from '@/lib/server/neon-types';
import {
  getScimGroupMembers,
  reconcileGroupMembers,
  recordSyncEvent,
  type ProvisionedRole,
} from '@/lib/server/scim/scim-provisioning-service';
import { isDirectorySyncAccessFailure, requireDirectorySyncAdmin } from '../directory-sync-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 'owner' is absent by design and the scim_groups check constraint refuses it:
// an IdP group must never be able to mint an organization owner.
const MAPPABLE_ROLES: readonly ProvisionedRole[] = ['admin', 'member', 'viewer'];

interface GroupSummaryRow {
  id: string;
  connection_id: string;
  external_id: string | null;
  display_name: string;
  mapped_role: ProvisionedRole | null;
  member_count: number | string;
  updated_at: string;
}

async function listGroups(organizationId: string): Promise<GroupSummaryRow[]> {
  return getNeonDb().query<GroupSummaryRow>(
    `select g.id, g.connection_id, g.external_id, g.display_name, g.mapped_role, g.updated_at,
            (select count(*)::int
               from scim_group_members m
              where m.group_id = g.id and m.organization_id = g.organization_id) as member_count
       from scim_groups g
      where g.organization_id = $1
      order by lower(g.display_name) asc`,
    [organizationId],
  );
}

function serializeGroup(row: GroupSummaryRow) {
  return {
    id: row.id,
    connection_id: row.connection_id,
    external_id: row.external_id,
    display_name: row.display_name,
    mapped_role: row.mapped_role,
    member_count: Number(row.member_count ?? 0),
    updated_at: row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  const rateLimited = await withRateLimit(request, 'default');
  if (rateLimited) return rateLimited;

  try {
    const access = await requireDirectorySyncAdmin(
      request,
      new URL(request.url).searchParams.get('organizationId'),
    );
    if (isDirectorySyncAccessFailure(access)) return access.response;

    const groups = await listGroups(access.organizationId);

    return NextResponse.json({
      groups: groups.map(serializeGroup),
      organization_id: access.organizationId,
      mappable_roles: MAPPABLE_ROLES,
      can_manage_roles: access.role === 'owner',
    });
  } catch (error) {
    logger.error({ error }, 'Error listing SCIM group role mappings');
    if (error instanceof Error && error.message.includes('fetch failed')) {
      return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const rateLimited = await withRateLimit(request, 'default');
  if (rateLimited) return rateLimited;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const groupId = body['groupId'];
    const mappedRole = body['mappedRole'];
    const organizationId = body['organizationId'];

    if (organizationId !== undefined && typeof organizationId !== 'string') {
      return NextResponse.json({ error: 'organizationId must be a string' }, { status: 400 });
    }

    const access = await requireDirectorySyncAdmin(request, (organizationId as string) ?? null);
    if (isDirectorySyncAccessFailure(access)) return access.response;

    if (access.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only an organization owner can change group role mapping' },
        { status: 403 },
      );
    }

    if (typeof groupId !== 'string' || !UUID_PATTERN.test(groupId)) {
      return NextResponse.json({ error: 'groupId must be a UUID' }, { status: 400 });
    }

    if (
      mappedRole !== null &&
      !(
        typeof mappedRole === 'string' && (MAPPABLE_ROLES as readonly string[]).includes(mappedRole)
      )
    ) {
      return NextResponse.json(
        { error: `mappedRole must be null or one of: ${MAPPABLE_ROLES.join(', ')}` },
        { status: 400 },
      );
    }

    const nextRole = (mappedRole as ProvisionedRole | null) ?? null;
    const db = getNeonDb();

    const existing = await db
      .query<Pick<ScimGroupRow, 'id' | 'connection_id' | 'display_name' | 'mapped_role'>>(
        `select id, connection_id, display_name, mapped_role
           from scim_groups
          where id = $1 and organization_id = $2
          limit 1`,
        [groupId, access.organizationId],
      )
      .then((rows) => rows[0] ?? null);

    if (!existing) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const ctx = {
      connectionId: existing.connection_id,
      organizationId: access.organizationId,
    };

    const reconciledMembers = await db.transaction(async (tx) => {
      await tx.execute(
        `update scim_groups
            set mapped_role = $3, version = version + 1
          where id = $1 and organization_id = $2`,
        [groupId, access.organizationId, nextRole],
      );

      const members = await getScimGroupMembers(tx, ctx, groupId);
      await reconcileGroupMembers(
        tx,
        ctx,
        members.map((member) => member.id),
      );
      return members.length;
    });

    await recordSyncEvent(db, ctx, {
      eventType: 'group.role_mapping_changed',
      payload: {
        scimGroupId: groupId,
        displayName: existing.display_name,
        previousRole: existing.mapped_role,
        mappedRole: nextRole,
        membersReconciled: reconciledMembers,
      },
    });

    await logSecurityEvent({
      userId: access.userId,
      eventType: 'admin_action',
      severity: 'high',
      ipAddress: getClientIp(request),
      endpoint: '/api/admin/directory-sync/groups',
      details: {
        action: 'scim_group_role_mapping_changed',
        groupId,
        previousRole: existing.mapped_role,
        mappedRole: nextRole,
        membersReconciled: reconciledMembers,
        organizationId: access.organizationId,
      },
    });

    const groups = await listGroups(access.organizationId);
    const updated = groups.find((row) => row.id === groupId);

    return NextResponse.json({
      group: updated ? serializeGroup(updated) : null,
      members_reconciled: reconciledMembers,
    });
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Error updating SCIM group role mapping');
    if (error instanceof Error && error.message.includes('fetch failed')) {
      return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
