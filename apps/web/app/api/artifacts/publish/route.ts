import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { buildExternalSharingGateResponse } from '@/lib/managed-compute-gate';
import { inspectOutboundContent } from '@/lib/security/outbound-content-inspection';
import { moderateManagedPrompt } from '@/lib/moderation';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import {
  MAX_CONTENT_CHARS,
  PUBLISHABLE_KINDS,
  PublishedArtifactOwnershipError,
  PublishedArtifactQuotaError,
  PublishedArtifactValidationError,
  buildPublishedArtifactUrl,
  listPublishedArtifacts,
  publishArtifactRecord,
  recordPublishedVersion,
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

function refuseModeratedPublication(userId: string, title: string, content: string): void {
  const moderation = moderateManagedPrompt({
    userId,
    segments: [title, content],
    surface: 'published-artifact',
  });
  if (!moderation.allowed) {
    throw createError.validation(
      'This artifact cannot be published because it violates the AGI Workforce usage policy.',
    );
  }
}

/**
 * The workspace the publisher could share this with, or null when they belong
 * to none. The panel renders its audience control from this rather than
 * offering a workspace option that would answer 403.
 */
async function describeWorkspaceAudience(
  db: DatabaseAdapter,
  organizationId: string | null,
): Promise<{ memberCount: number } | null> {
  if (!organizationId) return null;
  const [row] = await db.query<{ member_count: number | string | null }>(
    `select count(*) as member_count
       from public.organization_members
      where organization_id = $1`,
    [organizationId],
  );
  const parsed = Number(row?.member_count ?? 0);
  return { memberCount: Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0 };
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

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const sharingGateResponse = await buildExternalSharingGateResponse(userId, request);
  if (sharingGateResponse) return sharingGateResponse;

  refuseModeratedPublication(userId, parsed.data.title, parsed.data.content);

  const outbound = await inspectOutboundContent({
    channel: 'artifact_publish',
    value: parsed.data.content,
    userId,
    organizationId,
    resourceId: parsed.data.artifactId,
    resolveMode: () => resolveSecretHandlingPolicy(db, userId),
  });
  if (outbound.action === 'blocked') {
    throw createError.validation(outbound.message);
  }
  const publishContent = outbound.value;

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
    if (isPublishedArtifactSchemaUnavailable(error)) return publishingUnavailableResponse();
    throw error;
  }

  let version: number;
  try {
    version = await recordPublishedVersion(db, {
      publishedArtifactId: published.id,
      userId,
      title: published.title,
      kind: published.kind,
      language: published.language,
      content: publishContent,
    });
  } catch (error) {
    if (isPublishedArtifactSchemaUnavailable(error)) return publishingUnavailableResponse();
    throw error;
  }

  return NextResponse.json(
    {
      token: published.token,
      shareUrl: buildPublishedArtifactUrl(published.token),
      publishedAt: published.updatedAt,
      version,
      kind: published.kind,
      title: published.title,
      sandboxed: requiresSandboxedRender(published.kind),
      visibility: published.visibility,
      workspace: await describeWorkspaceAudience(db, organizationId),
    },
    { status: 201 },
  );
}

async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request);
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
    workspace: await describeWorkspaceAudience(db, organizationId),
  });
}

export const POST = withCorsRoute(withErrorHandler(handlePublish));
export const GET = withCorsRoute(withErrorHandler(handleList));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
