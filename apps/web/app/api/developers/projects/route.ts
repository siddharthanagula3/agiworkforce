import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  DEVELOPER_PROJECT_NAME_MAX,
  createDeveloperProject,
  listDeveloperProjects,
} from '@/lib/services/developer-project-service';

const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(DEVELOPER_PROJECT_NAME_MAX),
});

async function handleList(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'developer-console');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  return NextResponse.json({ projects: await listDeveloperProjects(db, userId) });
}

async function handleCreate(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'developer-console-write');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const body = await readValidatedJsonBody(
    request,
    CreateProjectSchema,
    `A project needs a name of up to ${DEVELOPER_PROJECT_NAME_MAX} characters.`,
  );
  const project = await createDeveloperProject(db, userId, body);
  return NextResponse.json({ project }, { status: 201 });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);
