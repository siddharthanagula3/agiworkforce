import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  UpdateArtifactCommentSchema,
  deleteArtifactComment,
  updateArtifactComment,
} from '@/lib/services/artifact-comment-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ artifactId: string; commentId: string }> };

const IdSchema = z.string().uuid();

async function readCommentId(context: RouteContext): Promise<string> {
  const { artifactId, commentId } = await context.params;
  if (!IdSchema.safeParse(artifactId).success || !IdSchema.safeParse(commentId).success) {
    throw createError.notFound('Comment not found');
  }
  return commentId;
}

async function handleUpdate(request: NextRequest, context: RouteContext): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;
  const commentId = await readCommentId(context);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Request body must be JSON');
  }
  const parsed = UpdateArtifactCommentSchema.safeParse(rawBody);
  if (!parsed.success)
    throw createError.validation('Invalid comment change', parsed.error.flatten());

  const { db, userId } = await getUserScopedDb(request);
  const comment = await updateArtifactComment(db, {
    userId,
    commentId,
    ...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
    ...(parsed.data.resolved !== undefined ? { resolved: parsed.data.resolved } : {}),
  });
  if (!comment) throw createError.notFound('Comment not found');
  return NextResponse.json({ comment });
}

async function handleDelete(request: NextRequest, context: RouteContext): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;
  const commentId = await readCommentId(context);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;
  const { db, userId } = await getUserScopedDb(request);
  if (!(await deleteArtifactComment(db, { userId, commentId }))) {
    throw createError.notFound('Comment not found');
  }
  return new Response(null, { status: 204 });
}

export const PATCH = withErrorHandler(handleUpdate);
export const DELETE = withErrorHandler(handleDelete);
