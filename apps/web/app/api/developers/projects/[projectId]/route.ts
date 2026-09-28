import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  DEVELOPER_PROJECT_NAME_MAX,
  archiveDeveloperProject,
  updateDeveloperProject,
} from '@/lib/services/developer-project-service';

type ProjectContext = { params: Promise<{ projectId: string }> };

const ProjectIdSchema = z.string().uuid();

const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1).max(DEVELOPER_PROJECT_NAME_MAX),
});

async function readProjectId(context: ProjectContext): Promise<string> {
  const parsed = ProjectIdSchema.safeParse((await context.params).projectId);
  if (!parsed.success) throw createError.notFound('That project does not exist.');
  return parsed.data;
}

async function handleUpdate(request: NextRequest, context: ProjectContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'developer-console-write');
  if (rateLimitResponse) return rateLimitResponse;

  const projectId = await readProjectId(context);
  const { db, userId } = await getUserScopedDb(request);
  const patch = await readValidatedJsonBody(
    request,
    UpdateProjectSchema,
    `A project needs a name of up to ${DEVELOPER_PROJECT_NAME_MAX} characters.`,
  );
  const project = await updateDeveloperProject(db, userId, projectId, patch);
  return NextResponse.json({ project });
}

async function handleArchive(request: NextRequest, context: ProjectContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'developer-console-write');
  if (rateLimitResponse) return rateLimitResponse;

  const projectId = await readProjectId(context);
  const { db, userId } = await getUserScopedDb(request);
  const { project, revokedKeyIds } = await archiveDeveloperProject(db, userId, projectId);

  await Promise.all(
    revokedKeyIds.map((keyId) =>
      recordAuditEvent({
        userId,
        eventType: 'api_key_revoked',
        request,
        detail: {
          resourceType: 'api_key',
          resourceId: keyId,
          reason: 'developer_project_archived',
          subjectRef: projectId,
        },
      }),
    ),
  );

  return NextResponse.json({ project, revokedKeys: revokedKeyIds.length });
}

export const PATCH = withErrorHandler(handleUpdate);
export const DELETE = withErrorHandler(handleArchive);
