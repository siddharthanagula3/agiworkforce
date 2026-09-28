import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  CloudAgentRunSteerRequestSchema,
  MAX_CLOUD_AGENT_PENDING_STEERS,
  MAX_CLOUD_AGENT_RUN_STEER_LENGTH,
} from '@agiworkforce/cloud-contracts';
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
  CloudAgentCodeRunNotSteerableError,
  CloudAgentRunNotFoundError,
  CloudAgentRunNotSteerableError,
  CloudAgentRunSteerQueueFullError,
  queueCloudAgentRunSteer,
} from '@/lib/services/cloud-agent-run-service';
import { applySecretHandlingToTexts } from '../../../lib/secret-handling-gate';

export const runtime = 'nodejs';
export const maxDuration = 30;

type RouteContext = { params: Promise<{ runId: string }> };
const RunIdSchema = z.string().uuid();

const INVALID_STEER_MESSAGE = `Write a message of 1 to ${MAX_CLOUD_AGENT_RUN_STEER_LENGTH.toLocaleString('en-US')} characters for the agent.`;
const SECRET_IN_STEER_MESSAGE =
  'This message was blocked because it appears to contain a secret, such as an API key or access token. Remove it and try again.';

async function handleSteer(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'llm-completion');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const parsedRunId = RunIdSchema.safeParse((await context.params).runId);
  if (!parsedRunId.success) throw createError.notFound('Cloud agent run not found');

  const body = CloudAgentRunSteerRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) throw createError.badRequest(INVALID_STEER_MESSAGE);
  const gate = await applySecretHandlingToTexts(userId, [body.data.message]);
  if (gate.action === 'blocked') throw createError.badRequest(SECRET_IN_STEER_MESSAGE);
  const text = gate.action === 'redacted' ? (gate.texts[0] ?? '').trim() : body.data.message;
  if (!text || text.length > MAX_CLOUD_AGENT_RUN_STEER_LENGTH) {
    throw createError.badRequest(INVALID_STEER_MESSAGE);
  }

  try {
    const queued = await queueCloudAgentRunSteer(db, {
      userId,
      organizationId,
      runId: parsedRunId.data,
      text,
    });
    return NextResponse.json(queued, {
      status: 202,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    });
  } catch (error) {
    if (error instanceof CloudAgentRunNotFoundError) {
      throw createError.notFound('Cloud agent run not found');
    }
    if (error instanceof CloudAgentCodeRunNotSteerableError) {
      throw createError.conflict(
        'This task is running in Code. Send your message in its Code session instead.',
      );
    }
    if (error instanceof CloudAgentRunSteerQueueFullError) {
      throw createError.conflict(
        `This task already has ${MAX_CLOUD_AGENT_PENDING_STEERS} messages waiting. Send more once it has read them.`,
      );
    }
    if (error instanceof CloudAgentRunNotSteerableError) {
      throw createError.conflict(
        'Only a task that is still working can take a message. This one is pausing, waiting on you, or has stopped.',
      );
    }
    throw error;
  }
}

export const POST = withCorsRoute(withErrorHandler(handleSteer));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
