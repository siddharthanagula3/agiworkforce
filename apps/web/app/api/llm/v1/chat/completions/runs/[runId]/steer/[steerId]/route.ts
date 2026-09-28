import 'server-only';

import type { CloudAgentRunSteerWithdrawResponse } from '@agiworkforce/cloud-contracts';
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
  CloudAgentRunSteerNotFoundError,
  CloudAgentRunSteerStillReadableError,
  withdrawCloudAgentRunSteer,
} from '@/lib/services/cloud-agent-run-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

type RouteContext = { params: Promise<{ runId: string; steerId: string }> };
const IdSchema = z.string().uuid();

async function handleWithdraw(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'llm-completion');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const params = await context.params;
  const runId = IdSchema.safeParse(params.runId);
  const steerId = IdSchema.safeParse(params.steerId);
  if (!runId.success || !steerId.success) throw createError.notFound('Message not found');

  try {
    const withdrawn: CloudAgentRunSteerWithdrawResponse = {
      run: await withdrawCloudAgentRunSteer(db, {
        userId,
        organizationId,
        runId: runId.data,
        steerId: steerId.data,
      }),
    };
    return NextResponse.json(withdrawn, {
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    });
  } catch (error) {
    if (error instanceof CloudAgentRunNotFoundError) {
      throw createError.notFound('Cloud agent run not found');
    }
    if (error instanceof CloudAgentRunSteerNotFoundError) {
      throw createError.notFound('Message not found');
    }
    if (error instanceof CloudAgentRunSteerStillReadableError) {
      throw createError.conflict(
        'This task can still read your message. It stays queued until the task reads it.',
      );
    }
    throw error;
  }
}

export const DELETE = withCorsRoute(withErrorHandler(handleWithdraw));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
