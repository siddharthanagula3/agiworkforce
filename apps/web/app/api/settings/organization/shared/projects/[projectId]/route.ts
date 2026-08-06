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

/**
 * Share / un-share one project with the caller's organization, and set
 * per-member access on it.
 *
 *   PUT    /api/settings/organization/shared/projects/:projectId  — share
 *   PATCH  /api/settings/organization/shared/projects/:projectId  — member access
 *   DELETE /api/settings/organization/shared/projects/:projectId  — un-share
 *
 * TENANCY. `projectId` is client-supplied and is treated as untrusted: it is
 * shape-validated as a uuid here, and every statement pairs it with the
 * SERVER-DERIVED `organizationId` from `organization_members`. An admin of
 * org A passing a project shared into org B therefore matches zero rows —
 * and the RLS policies on `app_rls` refuse it a second time, because
 * `app_org_resource_is_manageable(organization_id)` resolves membership inside
 * the database.
 *
 * OWNERSHIP. Sharing is restricted to a project the CALLER owns. An admin
 * cannot conscript another member's personal project into the org's shared set
 * — that would retroactively expose that member's instructions and knowledge
 * files to the whole organization without their action. See
 * org-sharing-service.ts for the SQL that enforces it.
 *
 * WHAT SHARING EXPOSES. A shared project's `instructions` and its
 * `project_knowledge_files` (including extracted text) become readable by every
 * member who is not explicitly denied. Conversations under the project stay
 * PERSONAL: nothing here touches `web_conversations`, and no policy in 0086
 * widens it.
 */

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * READ-ONLY IN THIS SLICE — and the wire says so.
 *
 * `organization_shared_projects.default_access` and
 * `organization_project_access.access` both accept `'write'` at the schema
 * level, but nothing honours it yet: 0086's `user_projects_org_shared_read`
 * policy is `FOR SELECT` only, and PUT/DELETE on /api/projects/[id] still match
 * `where id = $1 and user_id = $2`. Accepting `'write'` here would sell an
 * admin a permission the product does not grant, so the wire vocabulary is
 * narrowed to what actually works. Widening it is a deliberate follow-up that
 * must change the policy, the routes, and this schema together.
 */
const ShareSchema = z.object({}).strict();

const MemberAccessSchema = z
  .object({
    userId: z.string().trim().min(1).max(255),
    // `inherit` removes the override so the member falls back to the share's
    // default; `none` is an explicit denial that RLS itself honours.
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
