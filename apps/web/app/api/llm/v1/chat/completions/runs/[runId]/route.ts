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
  getCloudAgentRun,
  requestCloudAgentRunCancellation,
} from '@/lib/services/cloud-agent-run-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

type RouteContext = { params: Promise<{ runId: string }> };
const RunIdSchema = z.string().uuid();

function integerQueryValue(value: string | null, fallback: number): number {
  if (value === null || !/^-?\d+$/.test(value)) return fallback;
  return Number(value);
}

async function resolveRunId(context: RouteContext): Promise<string> {
  const { runId } = await context.params;
  const parsed = RunIdSchema.safeParse(runId);
  if (!parsed.success) throw createError.notFound('Cloud agent run not found');
  return parsed.data;
}

async function handleGet(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'agent-run-follow');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const runId = await resolveRunId(context);
  const url = new URL(request.url);
  const afterSequence = Math.max(-1, integerQueryValue(url.searchParams.get('after'), -1));
  const limit = Math.min(500, Math.max(1, integerQueryValue(url.searchParams.get('limit'), 100)));
  const snapshot = await getCloudAgentRun(db, {
    userId,
    runId,
    afterSequence,
    limit,
  });
  if (!snapshot) throw createError.notFound('Cloud agent run not found');
  const nextAfterSequence = snapshot.events.at(-1)?.sequence ?? afterSequence;

  return NextResponse.json(
    {
      ...snapshot,
      nextAfterSequence,
    },
    { headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
  );
}

async function handleCancel(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'llm-completion');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const runId = await resolveRunId(context);

  try {
    const run = await requestCloudAgentRunCancellation(db, { userId, runId });
    return NextResponse.json(
      { run },
      {
        status: 202,
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
      },
    );
  } catch (error) {
    if (error instanceof CloudAgentRunNotFoundError) {
      throw createError.notFound('Cloud agent run not found');
    }
    throw error;
  }
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handleCancel));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
