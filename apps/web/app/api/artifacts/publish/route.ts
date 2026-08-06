import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  MAX_CONTENT_CHARS,
  PUBLISHABLE_KINDS,
  PublishedArtifactValidationError,
  buildPublishedArtifactUrl,
  listPublishedArtifacts,
  publishArtifactRecord,
  requiresSandboxedRender,
} from '@/lib/services/published-artifact-service';

/**
 * Artifact publishing (CAP-015 slice 1).
 *
 *   POST /api/artifacts/publish - publish (or re-publish) one artifact
 *   GET  /api/artifacts/publish - the caller's own published artifacts
 *
 * Revocation lives at DELETE /api/artifacts/publish/[token].
 *
 * This directory existed and was EMPTY, which is why
 * `packages/platform/artifacts` could truthfully say no surface ships a
 * `CloudPublisher`. Both handlers require auth and run every statement through
 * `getUserScopedDb`, so migration 0095's owner-only policies enforce isolation
 * in the database and not merely in a WHERE clause.
 *
 * Publishing makes content readable by anyone holding the 144-bit token, so the
 * write path is CSRF-guarded and rate limited: a cross-site POST must never be
 * able to make a signed-in user's artifact public behind their back.
 */

export const runtime = 'nodejs';

const PublishSchema = z.object({
  artifactId: z.string().trim().min(1).max(200),
  title: z.string().trim().max(300).default(''),
  kind: z.enum(PUBLISHABLE_KINDS),
  language: z.string().trim().max(50).optional(),
  content: z.string().min(1).max(MAX_CONTENT_CHARS),
  conversationId: z.string().trim().uuid().optional(),
});

async function handlePublish(request: NextRequest): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  // 'share-create' is the existing publish-a-public-URL budget (5/min); this
  // endpoint mints exactly the same class of public link.
  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Request body must be JSON');
  }

  const parsed = PublishSchema.safeParse(rawBody);
  if (!parsed.success) {
    // Zod rejects unpublishable kinds here (pdf/docx/image/spreadsheet/...) —
    // there is no safe public renderer for them, so they never reach the DB.
    throw createError.validation('Invalid publish request', parsed.error.flatten());
  }

  const { db, userId } = await getUserScopedDb(request);

  let published;
  try {
    published = await publishArtifactRecord(db, {
      userId,
      artifactId: parsed.data.artifactId,
      title: parsed.data.title,
      kind: parsed.data.kind,
      conversationId: parsed.data.conversationId ?? null,
      ...(parsed.data.language ? { language: parsed.data.language } : {}),
      content: parsed.data.content,
    });
  } catch (error) {
    if (error instanceof PublishedArtifactValidationError) {
      throw createError.validation(error.message);
    }
    throw error;
  }

  return NextResponse.json(
    {
      token: published.token,
      // The name @agiworkforce/artifacts' CloudPublisher contract expects.
      shareUrl: buildPublishedArtifactUrl(published.token),
      publishedAt: published.updatedAt,
      kind: published.kind,
      title: published.title,
      // Stated so the client can be honest about HOW the page will render:
      // scripted kinds are served only inside the cross-origin sandbox frame.
      sandboxed: requiresSandboxedRender(published.kind),
    },
    { status: 201 },
  );
}

async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const artifacts = await listPublishedArtifacts(db, { userId });

  return NextResponse.json({
    artifacts: artifacts.map((artifact) => ({
      ...artifact,
      shareUrl: buildPublishedArtifactUrl(artifact.token),
      sandboxed: requiresSandboxedRender(artifact.kind),
    })),
  });
}

export const POST = withCorsRoute(withErrorHandler(handlePublish));
export const GET = withCorsRoute(withErrorHandler(handleList));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
