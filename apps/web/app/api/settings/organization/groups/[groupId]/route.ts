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
  MAX_WORKSPACE_GROUP_NAME_CHARS,
  deleteWorkspaceGroup,
  renameWorkspaceGroup,
} from '@/lib/services/organization-role-service';
import { requireWorkspaceConsolePermission } from '../../workspace-access';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DENIED = 'Your workspace role does not allow changing groups.';

const RenameSchema = z
  .object({ name: z.string().trim().min(1).max(MAX_WORKSPACE_GROUP_NAME_CHARS) })
  .strict();

type RouteContext = { params: Promise<{ groupId: string }> };

async function groupIdFrom(context: RouteContext): Promise<string> {
  const { groupId } = await context.params;
  if (!UUID_RE.test(groupId)) throw createError.validation('groupId must be a uuid');
  return groupId;
}

async function handleRename(request: NextRequest, context: RouteContext) {
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
  const { name } = await readValidatedJsonBody(request, RenameSchema, 'Invalid group');
  await renameWorkspaceGroup(getNeonDb(), { organizationId, groupId, name });

  await recordAuditEvent({
    userId,
    eventType: 'workspace_group_changed',
    organizationId,
    request,
    severity: 'info',
    detail: {
      resourceType: 'workspace_group',
      resourceId: groupId,
      status: 'renamed',
      role: access.role,
    },
  });

  return NextResponse.json({ groupId, name });
}

async function handleDelete(request: NextRequest, context: RouteContext) {
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
  await deleteWorkspaceGroup(getNeonDb(), { organizationId, groupId });

  await recordAuditEvent({
    userId,
    eventType: 'workspace_group_changed',
    organizationId,
    request,
    severity: 'warning',
    detail: {
      resourceType: 'workspace_group',
      resourceId: groupId,
      status: 'deleted',
      role: access.role,
    },
  });

  return NextResponse.json({ groupId, deleted: true });
}

export const PATCH = withErrorHandler(handleRename);
export const DELETE = withErrorHandler(handleDelete);
