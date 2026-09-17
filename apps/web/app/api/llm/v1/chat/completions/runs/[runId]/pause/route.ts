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
  CloudAgentRunNotFoundError,
  CloudAgentRunNotPausableError,
  requestCloudAgentRunPause,
} from '@/lib/services/cloud-agent-run-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

type RouteContext = { params: Promise<{ runId: string }> };
const RunIdSchema = z.string().uuid();

async function handlePause(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'llm-completion');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const parsedRunId = RunIdSchema.safeParse((await context.params).runId);
  if (!parsedRunId.success) throw createError.notFound('Cloud agent run not found');

  try {
    const run = await requestCloudAgentRunPause(db, { userId, runId: parsedRunId.data });
    return NextResponse.json(
      { run },
      { status: 202, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
    );
  } catch (error) {
    if (error instanceof CloudAgentRunNotFoundError) {
      throw createError.notFound('Cloud agent run not found');
    }
    if (error instanceof CloudAgentRunNotPausableError) {
      throw createError.conflict(
        'Only a task that is still working can be paused. This one is waiting on you or has already stopped.',
      );
    }
    throw error;
  }
}

export const POST = withCorsRoute(withErrorHandler(handlePause));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
