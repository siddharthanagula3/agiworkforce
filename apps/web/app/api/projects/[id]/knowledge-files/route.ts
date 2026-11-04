import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { readFileStorageMeter } from '@/lib/server/file-storage';
import {
  READABLE_PROJECT_SCOPE_SQL,
  selectReadableProject,
} from '@/lib/server/project-read-access';
import { ManagedCloudProjectKnowledgeRegisterRequestSchema } from '@agiworkforce/cloud-contracts';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  projectKnowledgeResponse,
  readIndexStates,
  registerProjectKnowledgeFile,
} from '@/lib/server/project-knowledge-files';

type RouteContext = { params: Promise<{ id: string }> };

async function handleListKnowledgeFiles(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { id: projectId } = await context.params;

  const project = await selectReadableProject(db, { userId, organizationId }, projectId);

  if (!project) {
    throw createError.notFound('Project not found');
  }

  let data: Record<string, unknown>[];
  try {
    data = await db.query<Record<string, unknown>>(
      `select f.*
         from project_knowledge_files f
         join user_projects p on p.id = f.project_id
        where ${READABLE_PROJECT_SCOPE_SQL}
          and f.deleted_at is null and f.superseded_at is null
        order by f.added_at desc`,
      [projectId, userId, organizationId],
    );
  } catch (error) {
    logger.error({ error, projectId }, 'Failed to fetch knowledge files');
    throw createError.internal('Failed to fetch knowledge files');
  }

  const storage = await readFileStorageMeter({ db, userId, organizationId });

  const indexStates = await readIndexStates(
    db,
    projectId,
    data.map((row) => String(row['id'] ?? '')).filter(Boolean),
  );

  return NextResponse.json({
    files: data.map((row) =>
      projectKnowledgeResponse(row, projectId, indexStates.get(String(row['id'] ?? '')) ?? null),
    ),
    storage,
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
  return NextResponse.json(
    {
      file: registration.file,
      ...(registration.notice ? { notice: registration.notice } : {}),
    },
    { status: 201 },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleListKnowledgeFiles));
export const POST = withCorsRoute(withErrorHandler(handleCreateKnowledgeFile));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
