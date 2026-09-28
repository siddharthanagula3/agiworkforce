import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { getKnowledgeStorageLimitBytes } from '@/lib/services/free-plan-entitlements';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveSharedProjectScope } from '@/lib/services/org-sharing-service';
import { ManagedCloudProjectKnowledgeRegisterRequestSchema } from '@agiworkforce/cloud-contracts';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  isSchemaNotReady,
  projectKnowledgeResponse,
  readIndexStates,
  registerProjectKnowledgeFile,
} from '@/lib/server/project-knowledge-files';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Migration 0090 grants an organization member SELECT on the knowledge files of
 * a project shared with them, and restricts every write to the owner. The
 * database is the authority here, and this read has to match it: filtering the
 * lookup by `user_id` refused the read the policy allows, so a shared project
 * opened to a sources panel that could never load.
 */
async function selectReadableProject(
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'],
  projectId: string,
  userId: string,
  organizationId: string | null,
): Promise<{ id: string } | undefined> {
  const [owned] = await db.query<{ id: string }>(
    `select id
       from user_projects
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3::uuid
        and is_archived = false
        and deleted_at is null
      limit 1`,
    [projectId, userId, organizationId],
  );
  if (owned || !organizationId) return owned;

  const sharedScope = await resolveSharedProjectScope(db, userId);
  if (sharedScope?.organizationId !== organizationId || sharedScope.projectIds.length === 0) {
    return undefined;
  }

  const [shared] = await db.query<{ id: string }>(
    `select id
       from user_projects
      where id = $1
        and id = any($2::uuid[])
        and organization_id is not distinct from $3::uuid
        and is_archived = false
        and deleted_at is null
      limit 1`,
    [projectId, sharedScope.projectIds, organizationId],
  );
  return shared;
}

async function handleListKnowledgeFiles(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id: projectId } = await context.params;

  const project = await selectReadableProject(db, projectId, userId, organizationId);

  if (!project) {
    throw createError.notFound('Project not found');
  }

  let data: Record<string, unknown>[];
  try {
    data = await db.query<Record<string, unknown>>(
      `select * from project_knowledge_files
       where project_id = $1 and deleted_at is null and superseded_at is null
       order by added_at desc`,
      [projectId],
    );
  } catch (error) {
    if (isSchemaNotReady(error)) {
      return NextResponse.json(
        {
          error: 'knowledge_files_unavailable',
          message: 'Project sources are temporarily unavailable.',
        },
        { status: 503 },
      );
    }
    logger.error({ error, projectId }, 'Failed to fetch knowledge files');
    throw createError.internal('Failed to fetch knowledge files');
  }

  // The storage cap is enforced on upload and was invisible until it refused
  // you. It is ACCOUNT-wide, not per project, so the panel cannot compute it
  // from the files it just listed, the total has to come from here.
  // The meter is context; the file list is the point of this endpoint. Neither
  // the plan read nor the usage read may take the list down with it, so both
  // degrade to "no meter" rather than propagating.
  let limitBytes: number | null = null;
  try {
    limitBytes = getKnowledgeStorageLimitBytes(await resolveEntitledPlanTier(db, userId));
  } catch (error) {
    logger.warn({ error, userId }, 'Knowledge storage meter: plan read failed');
  }
  let usedBytes: number | null = null;
  try {
    const [usage] = await db.query<{ total: string | number | null }>(
      // Must match handleCreateKnowledgeFile's usage query EXACTLY, including
      // the organization scope. A meter computed over a different set than the
      // cap enforces is worse than no meter: it reads as headroom the upload
      // will refuse.
      `select coalesce(sum(k.byte_count), 0) as total
        from project_knowledge_files k
         join user_projects p on p.id = k.project_id
          and p.deleted_at is null
        where p.user_id = $1
          and p.organization_id is not distinct from $2::uuid
          and k.deleted_at is null
          and k.superseded_at is null`,
      [userId, organizationId],
    );
    usedBytes = Number(usage?.total ?? 0);
  } catch (error) {
    if (!isSchemaNotReady(error)) {
      logger.warn({ error, userId }, 'Knowledge storage meter: usage read failed');
    }
  }

  const indexStates = await readIndexStates(
    db,
    projectId,
    data.map((row) => String(row['id'] ?? '')).filter(Boolean),
  );

  return NextResponse.json({
    files: data.map((row) =>
      projectKnowledgeResponse(row, projectId, indexStates.get(String(row['id'] ?? '')) ?? null),
    ),
    storage: { usedBytes, limitBytes },
  });
}

async function handleCreateKnowledgeFile(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id: projectId } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }
  const parsedBody = ManagedCloudProjectKnowledgeRegisterRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    const issue = parsedBody.error.issues[0];
    throw createError.validation(
      issue
        ? `${issue.path.join('.') || 'request'}: ${issue.message}`
        : 'Invalid project source metadata',
    );
  }
  const body = parsedBody.data;
  const registration = await registerProjectKnowledgeFile(
    { db, userId, organizationId, projectId },
    body,
  );
  if (registration.status === 'unavailable') {
    return NextResponse.json(
      {
        error: 'knowledge_files_unavailable',
        message: 'Knowledge files require Managed Cloud (pending migration apply)',
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ file: registration.file }, { status: 201 });
}

export const GET = withCorsRoute(withErrorHandler(handleListKnowledgeFiles));
export const POST = withCorsRoute(withErrorHandler(handleCreateKnowledgeFile));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
