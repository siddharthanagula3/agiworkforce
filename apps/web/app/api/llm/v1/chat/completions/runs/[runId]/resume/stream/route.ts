import 'server-only';

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import {
  getCorsHeaders,
  getSecurityHeaders,
  handleCorsPreflightRequest,
  withCorsRoute,
} from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireCsrfToken } from '@/lib/csrf';
import { readPersistedAssistantTurn } from '../../../../lib/assistant-turn-persistence';
import { buildTurnResumeStream } from '../../../../lib/stream-envelope';
import { SSE_RESPONSE_HEADERS } from '../../../../lib/sse-heartbeat';

type RouteContext = { params: Promise<{ runId: string }> };

const TurnStreamResumeSchema = z.object({
  conversation_id: z.string().uuid(),
  cursor: z.object({
    sequence: z.number().int().min(0),
    characters: z.number().int().min(0),
  }),
});

const TRUNCATED_FINISH_REASON = 'stopped';
const COMPLETED_FINISH_REASON = 'stop';

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json(
    { error: { message, type: 'invalid_request_error', code } },
    { status, headers: getSecurityHeaders() },
  );
}

/**
 * Replays the tail of a turn whose connection dropped. The cursor names what the
 * client already rendered, so nothing it has seen is sent to it twice.
 */
async function handleTurnStreamResume(request: NextRequest, context: RouteContext) {
  const turnId = (await context.params).runId;
  if (!z.string().uuid().safeParse(turnId).success) {
    return jsonError('Turn not found', 404, 'not_found');
  }

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, organizationId } = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  let fields: z.infer<typeof TurnStreamResumeSchema>;
  try {
    const parsed = TurnStreamResumeSchema.safeParse(await request.json());
    if (!parsed.success) return jsonError('Invalid resume cursor.', 400, 'resume_cursor_invalid');
    fields = parsed.data;
  } catch {
    return jsonError('Invalid JSON in resume request.', 400, 'resume_cursor_invalid');
  }

  const turn = await readPersistedAssistantTurn({
    userId,
    organizationId,
    conversationId: fields.conversation_id,
    messageId: turnId,
  });
  if (!turn) return jsonError('Turn not found', 404, 'not_found');

  const remainder = turn.content.slice(Math.min(fields.cursor.characters, turn.content.length));
  const body = buildTurnResumeStream({
    content: remainder,
    model: turn.model,
    completionId: `chatcmpl-resume-${randomUUID()}`,
    finishReason: turn.truncated ? TRUNCATED_FINISH_REASON : COMPLETED_FINISH_REASON,
    conversationId: fields.conversation_id,
    turnId,
    startSequence: fields.cursor.sequence,
  });

  return new NextResponse(body, {
    headers: {
      ...SSE_RESPONSE_HEADERS,
      'X-AGI-Stream-Resume': 'turn-cursor',
      'X-AGI-Stream-Resume-Characters': String(remainder.length),
      ...(turn.truncationReason ? { 'X-AGI-Stream-Truncation': turn.truncationReason } : {}),
      ...getCorsHeaders(request),
      ...getSecurityHeaders(),
    },
  });
}

export const POST = withCorsRoute(withErrorHandler(handleTurnStreamResume));

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
