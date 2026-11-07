import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { ManagedCloudPublishedArtifactVersionDetail } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { requireCsrfToken } from '@/lib/csrf';
import { preparePublishedArtifactPublication } from '@/lib/services/published-artifact-publication-policy';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  PUBLISHED_TOKEN_REGEX,
  PublishedArtifactOwnershipError,
  PublishedArtifactQuotaError,
  PublishedArtifactValidationError,
  buildPublishedArtifactUrl,
  readPublishedArtifactRestoreSource,
  readPublishedArtifactVersion,
  recordPublishedVersion,
  requiresSandboxedRender,
  restorePublishedArtifactRecord,
} from '@/lib/services/published-artifact-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ token: string; version: string }> };

async function handleReadVersion(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token, version } = await context.params;
  const number = Number(version);
  if (!PUBLISHED_TOKEN_REGEX.test(token) || !Number.isInteger(number) || number < 1) {
    throw createError.notFound('Published version not found');
  }

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const detail = await readPublishedArtifactVersion(db, { userId, token, version: number });
  if (!detail) throw createError.notFound('Published version not found');

  const body: ManagedCloudPublishedArtifactVersionDetail = detail;
  return NextResponse.json(body);
}

export const GET = withErrorHandler(handleReadVersion);

async function handleRestoreVersion(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token, version } = await context.params;
  const number = Number(version);
  if (!PUBLISHED_TOKEN_REGEX.test(token) || !Number.isSafeInteger(number) || number < 1) {
    throw createError.notFound('Published version not found');
  }

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const source = await readPublishedArtifactRestoreSource(db, { userId, token, version: number });
  if (!source) throw createError.notFound('Published version not found');
  const { publication, snapshot } = source;

  const preparation = await preparePublishedArtifactPublication(db, {
    request,
    userId,
    organizationId,
    artifactId: publication.artifactId,
    conversationId: publication.conversationId,
    title: snapshot.title,
    content: snapshot.content,
  });
  if (preparation instanceof Response) return preparation;

  let restored;
  try {
    restored = await restorePublishedArtifactRecord(db, {
      userId,
      publishedArtifactId: publication.id,
      token: publication.token,
      artifactId: publication.artifactId,
      conversationId: publication.conversationId,
      title: snapshot.title,
      kind: snapshot.kind,
      language: snapshot.language,
      content: preparation.content,
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
  if (!restored) {
    throw createError.conflict('This publication is no longer available to restore.');
  }

  // History remains a separate write: failure can follow an already committed restore.
  const restoredVersion = await recordPublishedVersion(db, {
    publishedArtifactId: restored.id,
    userId,
    title: restored.title,
    kind: restored.kind,
    language: restored.language,
    content: restored.content,
  });

  return NextResponse.json({
    token: restored.token,
    shareUrl: buildPublishedArtifactUrl(restored.token),
    publishedAt: restored.updatedAt,
    version: restoredVersion,
    kind: restored.kind,
    title: restored.title,
    sandboxed: requiresSandboxedRender(restored.kind),
    visibility: restored.visibility,
  });
}

export const POST = withErrorHandler(handleRestoreVersion);
