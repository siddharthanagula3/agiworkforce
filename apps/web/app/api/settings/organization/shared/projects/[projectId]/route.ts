import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  clearProjectMemberAccess,
  requireOrgAdmin,
  resolveOrgMembership,
  setProjectMemberAccess,
  shareProject,
  unshareProject,
} from '@/lib/services/org-sharing-service';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ShareSchema = z.object({}).strict();

const MemberAccessSchema = z
  .object({
    userId: z.string().trim().min(1).max(255),
    access: z.enum(['read', 'none', 'inherit']),
  })
  .strict();

function parseProjectId(raw: string): string {
  if (!UUID_RE.test(raw)) {
    throw createError.validation('projectId must be a uuid');
  }
  return raw;
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function handleShare(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { projectId } = await context.params;
  const parsedProjectId = parseProjectId(projectId);

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgAdmin(await resolveOrgMembership(db, userId));

  const parsed = ShareSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }

  const shared = await shareProject(db, {
    organizationId: membership.organizationId,
    projectId: parsedProjectId,
    actorUserId: userId,
    defaultAccess: 'read',
  });

  return NextResponse.json({ sharedProject: shared }, { status: 200 });
}

async function handleMemberAccess(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { projectId } = await context.params;
  const parsedProjectId = parseProjectId(projectId);

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgAdmin(await resolveOrgMembership(db, userId));

  const parsed = MemberAccessSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    throw createError.validation(parsed.error.issues[0]?.message ?? 'Invalid request body');
  }

  if (parsed.data.access === 'inherit') {
    const cleared = await clearProjectMemberAccess(
      db,
      membership.organizationId,
      parsedProjectId,
      parsed.data.userId,
    );
    return NextResponse.json({ cleared });
  }

  const grant = await setProjectMemberAccess(db, {
    organizationId: membership.organizationId,
    projectId: parsedProjectId,
    targetUserId: parsed.data.userId,
    access: parsed.data.access,
    grantedByUserId: userId,
  });

  return NextResponse.json({ grant });
}

async function handleUnshare(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { projectId } = await context.params;
  const parsedProjectId = parseProjectId(projectId);

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgAdmin(await resolveOrgMembership(db, userId));

  const removed = await unshareProject(db, membership.organizationId, parsedProjectId);
  if (!removed) {
    throw createError.notFound('That project is not shared with your organization');
  }

  return NextResponse.json({ success: true });
}

export const PUT = withErrorHandler(handleShare);
export const PATCH = withErrorHandler(handleMemberAccess);
export const DELETE = withErrorHandler(handleUnshare);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
