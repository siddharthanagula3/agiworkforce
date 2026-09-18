import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  MAX_STUDY_TOPIC_LENGTH,
  STUDY_LEVELS,
  STUDY_MODES,
  type StudySession,
} from '@/features/study/lib/study-session';
import {
  endStudySession,
  listStudySessions,
  readStudySessionForConversation,
  startStudySession,
} from '@/features/study/server/study-session-store';

export const runtime = 'nodejs';

const StartSchema = z
  .object({
    conversationId: z.string().uuid(),
    topic: z.string().trim().min(1).max(MAX_STUDY_TOPIC_LENGTH),
    mode: z.enum(STUDY_MODES),
    level: z.enum(STUDY_LEVELS),
  })
  .strict();

const EndSchema = z.object({ conversationId: z.string().uuid() }).strict();

export interface StudySessionsResponse {
  sessions: StudySession[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `?conversationId=` answers "is this conversation a study session", which is
 * what a chat surface needs before it composes a turn. It never widens beyond
 * the caller's own rows: the scoped connection applies the same policy.
 */
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation-list');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const conversationId = new URL(request.url).searchParams.get('conversationId');
  if (conversationId !== null) {
    if (!UUID.test(conversationId)) {
      throw createError.validation('Invalid conversationId');
    }
    const session = await readStudySessionForConversation(db, userId, conversationId);
    const payload: StudySessionsResponse = { sessions: session ? [session] : [] };
    return NextResponse.json(payload);
  }

  const payload: StudySessionsResponse = { sessions: await listStudySessions(db, userId) };
  return NextResponse.json(payload);
}

async function handlePost(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation-list');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const body = await readValidatedJsonBody(request, StartSchema, 'Invalid study session');

  const session = await startStudySession(db, {
    userId,
    conversationId: body.conversationId,
    topic: body.topic,
    mode: body.mode,
    level: body.level,
  });
  return NextResponse.json({ session }, { status: 201 });
}

async function handleDelete(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation-list');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const body = await readValidatedJsonBody(request, EndSchema, 'Invalid study session');

  const session = await endStudySession(db, userId, body.conversationId);
  if (!session) {
    throw createError.notFound('No study session is running on that conversation.');
  }
  return NextResponse.json({ session });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
export const DELETE = withErrorHandler(handleDelete);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
