import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { ManagedCloudPublishedArtifactListResponse } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { describePublishedArtifactWorkspace } from '@/lib/services/published-artifact-workspace';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { preparePublishedArtifactPublication } from '@/lib/services/published-artifact-publication-policy';
import {
  MAX_CONTENT_CHARS,
  PUBLISHABLE_KINDS,
  PublishedArtifactOwnershipError,
  PublishedArtifactQuotaError,
  PublishedArtifactValidationError,
  buildPublishedArtifactUrl,
  listPublishedArtifactsPage,
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

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const preparation = await preparePublishedArtifactPublication(db, {
    request,
    userId,
    organizationId,
    artifactId: parsed.data.artifactId,
    conversationId: parsed.data.conversationId ?? null,
    title: parsed.data.title,
    content: parsed.data.content,
  });
  if (preparation instanceof Response) return preparation;
  const publishContent = preparation.content;

  let published;
  try {
    published = await publishArtifactRecord(db, {
      userId,
      artifactId: parsed.data.artifactId,
      title: parsed.data.title,
      kind: parsed.data.kind,
      conversationId: parsed.data.conversationId ?? null,
      ...(parsed.data.language ? { language: parsed.data.language } : {}),
      content: publishContent,
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
    throw error;
  }

  return NextResponse.json(
    {
      token: published.token,
      shareUrl: buildPublishedArtifactUrl(published.token),
      publishedAt: published.updatedAt,
      version: published.version,
      kind: published.kind,
      title: published.title,
      sandboxed: requiresSandboxedRender(published.kind),
      visibility: published.visibility,
      workspace: await describePublishedArtifactWorkspace(db, organizationId),
    },
    { status: 201 },
  );
}

async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const search = request.nextUrl.searchParams;
  const rawLimit = search.get('limit');
  if (search.getAll('cursor').length > 1 || search.getAll('limit').length > 1 ||
      (rawLimit !== null && !/^[1-9]\d*$/.test(rawLimit))) {
    throw createError.validation('Invalid published artifact page request');
  }
  let page;
  try {
    page = await listPublishedArtifactsPage(db, {
      userId,
      ...(rawLimit === null ? {} : { limit: Number(rawLimit) }),
      ...(search.has('cursor') ? { cursor: search.get('cursor')! } : {}),
    });
  } catch (error) {
    if (error instanceof PublishedArtifactValidationError) throw createError.validation(error.message);
    throw error;
  }

  const body: ManagedCloudPublishedArtifactListResponse = {
    pageInfo: { nextCursor: page.nextCursor },
    artifacts: page.artifacts.map((artifact) => ({
      ...artifact,
      shareUrl: buildPublishedArtifactUrl(artifact.token),
      sandboxed: requiresSandboxedRender(artifact.kind),
    })),
    workspace: await describePublishedArtifactWorkspace(db, organizationId),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const POST = withCorsRoute(withErrorHandler(handlePublish));
export const GET = withCorsRoute(withErrorHandler(handleList));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
