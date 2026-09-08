import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import {
  getCorsHeaders,
  getSecurityHeaders,
  handleCorsPreflightRequest,
  withCorsRoute,
} from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  CloudAgentRunNotArchivableError,
  CloudAgentRunNotFoundError,
  CloudAgentRunRestoreStateUnknownError,
  archiveCloudAgentRun,
  unarchiveCloudAgentRun,
} from '@/lib/services/cloud-agent-run-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

type RouteContext = { params: Promise<{ runId: string }> };
const RunIdSchema = z.string().uuid();

async function resolveRunId(context: RouteContext): Promise<string> {
  const { runId } = await context.params;
  const parsed = RunIdSchema.safeParse(runId);
  if (!parsed.success) throw createError.notFound('Cloud agent run not found');
  return parsed.data;
}

function translate(error: unknown): never {
  if (error instanceof CloudAgentRunNotFoundError) {
    throw createError.notFound('Cloud agent run not found');
  }
  if (error instanceof CloudAgentRunNotArchivableError) {
    throw createError.conflict(
      'Only a task that has finished can be archived. Cancel it first, or wait for it to settle.',
    );
  }
  if (error instanceof CloudAgentRunRestoreStateUnknownError) {
    throw createError.conflict(
      'This task has no recorded state to restore, so it stays archived rather than being given a state it never had.',
    );
  }
  throw error;
}

async function handleArchive(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'agent-run-follow');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const runId = await resolveRunId(context);

  try {
    const run = await archiveCloudAgentRun(db, { userId, runId });
    return NextResponse.json(
      { run },
      { headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
    );
  } catch (error) {
    return translate(error);
  }
}

async function handleUnarchive(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'agent-run-follow');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const runId = await resolveRunId(context);

  try {
    const run = await unarchiveCloudAgentRun(db, { userId, runId });
    return NextResponse.json(
      { run },
      { headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
    );
  } catch (error) {
    return translate(error);
  }
}

export const POST = withCorsRoute(withErrorHandler(handleArchive));
export const DELETE = withCorsRoute(withErrorHandler(handleUnarchive));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
