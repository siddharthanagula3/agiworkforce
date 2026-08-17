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
  PublishedArtifactOwnershipError,
  PublishedArtifactQuotaError,
  PublishedArtifactValidationError,
  buildPublishedArtifactUrl,
  listPublishedArtifacts,
  publishArtifactRecord,
  requiresSandboxedRender,
} from '@/lib/services/published-artifact-service';

export const runtime = 'nodejs';

const PublishSchema = z.object({
  artifactId: z.string().trim().min(1).max(200),
  title: z.string().trim().max(300).default(''),
  kind: z.enum(PUBLISHABLE_KINDS),
  language: z.string().trim().max(50).optional(),
  content: z.string().min(1).max(MAX_CONTENT_CHARS),
  conversationId: z.string().trim().uuid().optional(),
});

const PG_UNDEFINED_TABLE = '42P01';

function isPublishedArtifactSchemaUnavailable(error: unknown): boolean {
  let candidate: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!candidate || typeof candidate !== 'object') return false;
    const row = candidate as Record<string, unknown>;
    if (row['code'] === PG_UNDEFINED_TABLE) return true;
    candidate = row['cause'];
  }
  return false;
}

function publishingUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: { message: 'Artifact publishing is not configured in this environment yet.' } },
    { status: 503 },
  );
}

async function handlePublish(request: NextRequest): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

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
    if (error instanceof PublishedArtifactOwnershipError) {
      throw createError.forbidden(error.message);
    }
    if (error instanceof PublishedArtifactQuotaError) {
      throw createError.conflict(error.message);
    }
    if (isPublishedArtifactSchemaUnavailable(error)) return publishingUnavailableResponse();
    throw error;
  }

  return NextResponse.json(
    {
      token: published.token,
      shareUrl: buildPublishedArtifactUrl(published.token),
      publishedAt: published.updatedAt,
      kind: published.kind,
      title: published.title,
      sandboxed: requiresSandboxedRender(published.kind),
    },
    { status: 201 },
  );
}

async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  let artifacts;
  try {
    artifacts = await listPublishedArtifacts(db, { userId });
  } catch (error) {
    if (isPublishedArtifactSchemaUnavailable(error)) return publishingUnavailableResponse();
    throw error;
  }

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
