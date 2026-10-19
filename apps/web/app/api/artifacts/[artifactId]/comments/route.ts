import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ArtifactCommentCreateRequestSchema,
  ArtifactCommentPathIdSchema,
  type ArtifactCommentListResponse,
  type ArtifactCommentResponse,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ArtifactCommentLimitError,
  createArtifactComment,
  listArtifactComments,
} from '@/lib/services/artifact-comment-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ artifactId: string }> };

async function readArtifactId(context: RouteContext): Promise<string> {
  const { artifactId } = await context.params;
  const parsed = ArtifactCommentPathIdSchema.safeParse(artifactId);
  if (!parsed.success) throw createError.notFound('Artifact not found');
  return parsed.data;
}

async function handleList(request: NextRequest, context: RouteContext): Promise<Response> {
  const artifactId = await readArtifactId(context);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;
  const { db, userId } = await getUserScopedDb(request);
  const comments = await listArtifactComments(db, { userId, artifactId });
  return NextResponse.json({ comments } satisfies ArtifactCommentListResponse);
}

async function handleCreate(request: NextRequest, context: RouteContext): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;
  const artifactId = await readArtifactId(context);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Request body must be JSON');
  }
  const parsed = ArtifactCommentCreateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid comment', parsed.error.flatten());
  }

  const { db, userId } = await getUserScopedDb(request);
  try {
    const comment = await createArtifactComment(db, {
      userId,
      artifactId,
      body: parsed.data.body,
      anchor: parsed.data.anchor,
      parentId: parsed.data.parentId ?? null,
      author: parsed.data.author,
    });
    if (!comment) throw createError.notFound('The comment being replied to was not found');
    return NextResponse.json({ comment } satisfies ArtifactCommentResponse, { status: 201 });
  } catch (error) {
    if (error instanceof ArtifactCommentLimitError) throw createError.conflict(error.message);
    throw error;
  }
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);
