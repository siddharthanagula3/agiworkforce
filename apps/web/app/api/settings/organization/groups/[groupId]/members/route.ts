import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  readWorkspaceGroupMembers,
  setWorkspaceGroupMembers,
} from '@/lib/services/organization-role-service';
import { requireWorkspaceConsolePermission } from '../../../workspace-access';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_GROUP_MEMBERS = 5_000;
const DENIED = 'Your workspace role does not allow changing group members.';

const MembersSchema = z
  .object({ userIds: z.array(z.string().trim().min(1).max(255)).max(MAX_GROUP_MEMBERS) })
  .strict();

type RouteContext = { params: Promise<{ groupId: string }> };

async function groupIdFrom(context: RouteContext): Promise<string> {
  const { groupId } = await context.params;
  if (!UUID_RE.test(groupId)) throw createError.validation('groupId must be a uuid');
  return groupId;
}

async function handleList(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const groupId = await groupIdFrom(context);
  const { organizationId } = await requireWorkspaceConsolePermission(
    request,
    'groups.manage',
    DENIED,
  );
  const userIds = await readWorkspaceGroupMembers(getNeonDb(), organizationId, groupId);
  return NextResponse.json({ groupId, userIds });
}

async function handleSet(request: NextRequest, context: RouteContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const groupId = await groupIdFrom(context);
  const { userId, organizationId, access } = await requireWorkspaceConsolePermission(
    request,
    'groups.manage',
    DENIED,
  );
  const { userIds } = await readValidatedJsonBody(request, MembersSchema, 'Invalid members');
  const change = await setWorkspaceGroupMembers(getNeonDb(), {
    organizationId,
    groupId,
    userIds,
    actorUserId: userId,
  });

  if (change.added.length > 0 || change.removed.length > 0) {
    await recordAuditEvent({
      userId,
      eventType: 'workspace_group_changed',
      organizationId,
      request,
      severity: 'warning',
      detail: {
        resourceType: 'workspace_group',
        resourceId: groupId,
        status: 'members_changed',
        reason: `added ${change.added.length}, removed ${change.removed.length}`,
        role: access.role,
      },
    });
  }

  return NextResponse.json({ groupId, userIds, ...change });
}

export const GET = withErrorHandler(handleList);
export const PUT = withErrorHandler(handleSet);
