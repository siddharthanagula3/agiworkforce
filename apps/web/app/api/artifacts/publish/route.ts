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
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import {
  MAX_CONTENT_CHARS,
  PUBLISHABLE_KINDS,
  PUBLISHED_TOKEN_REGEX,
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

const RestoreSchema = z.object({
  token: z.string().trim().regex(PUBLISHED_TOKEN_REGEX),
  version: z.number().int().min(1),
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

interface PublishedVersionRow {
  id: string;
  version: number | string;
  title: string;
  kind: string;
  language: string | null;
  content: string;
  created_at: string | Date;
}

function toVersionNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

/**
 * Append this publish to the artifact's history, unless it says exactly what
 * the newest version already says. Republishing an unchanged artifact is what
 * the Publish button does on every second click, and a history full of
 * identical versions is not a history.
 */
async function recordPublishedVersion(
  db: DatabaseAdapter,
  input: {
    publishedArtifactId: string;
    userId: string;
    title: string;
    kind: string;
    language: string | null;
    content: string;
  },
): Promise<number> {
  const [newest] = await db.query<PublishedVersionRow>(
    `select id, version, title, kind, language, content, created_at
       from public.published_artifact_versions
      where published_artifact_id = $1 and user_id = $2
      order by version desc
      limit 1`,
    [input.publishedArtifactId, input.userId],
  );

  if (
    newest &&
    newest.content === input.content &&
    newest.title === input.title &&
    newest.kind === input.kind &&
    (newest.language ?? null) === input.language
  ) {
    return toVersionNumber(newest.version);
  }

  const [inserted] = await db.query<{ version: number | string }>(
    `insert into public.published_artifact_versions
       (published_artifact_id, user_id, version, title, kind, language, content, parent_version_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning version`,
    [
      input.publishedArtifactId,
      input.userId,
      toVersionNumber(newest?.version) + 1,
      input.title,
      input.kind,
      input.language,
      input.content,
      newest?.id ?? null,
    ],
  );

  const version = toVersionNumber(inserted?.version);
  await db.execute(
    `update public.published_artifacts
        set version = $2
      where id = $1 and user_id = $3`,
    [input.publishedArtifactId, version, input.userId],
  );
  return version;
}

async function loadOwnedPublication(
  db: DatabaseAdapter,
  input: { userId: string; token: string },
): Promise<{ id: string; artifactId: string; conversationId: string | null } | null> {
  const [row] = await db.query<{
    id: string;
    artifact_id: string;
    conversation_id: string | null;
  }>(
    `select id, artifact_id, conversation_id
       from public.published_artifacts
      where token = $1 and user_id = $2
      limit 1`,
    [input.token, input.userId],
  );
  return row
    ? { id: row.id, artifactId: row.artifact_id, conversationId: row.conversation_id }
    : null;
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

/**
 * The history of one publication, newest first. Content comes with it: a
 * restore preview that cannot show what it would restore is not a preview.
 */
async function handleListVersions(request: NextRequest, token: string): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request);

  let publication: Awaited<ReturnType<typeof loadOwnedPublication>>;
  let rows: PublishedVersionRow[];
  try {
    publication = await loadOwnedPublication(db, { userId, token });
    if (!publication) throw createError.notFound('That published artifact does not exist.');
    rows = await db.query<PublishedVersionRow>(
      `select id, version, title, kind, language, content, created_at
         from public.published_artifact_versions
        where published_artifact_id = $1 and user_id = $2
        order by version desc`,
      [publication.id, userId],
    );
  } catch (error) {
    if (isPublishedArtifactSchemaUnavailable(error)) return publishingUnavailableResponse();
    throw error;
  }

  return NextResponse.json({
    token,
    artifactId: publication.artifactId,
    versions: rows.map((row) => ({
      version: toVersionNumber(row.version),
      title: row.title,
      kind: row.kind,
      language: row.language,
      content: row.content,
      createdAt: new Date(row.created_at).toISOString(),
    })),
  });
}

/**
 * Restore an earlier version by publishing it again. History is append-only, so
 * the restored content becomes the newest version rather than erasing the ones
 * after it, and the share URL does not change.
 */
async function handleRestore(request: NextRequest): Promise<Response> {
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

  const parsed = RestoreSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid restore request', parsed.error.flatten());
  }

  const { db, userId, organizationId } = await getUserScopedDb(request);

  let restored: number;
  let publication: Awaited<ReturnType<typeof loadOwnedPublication>>;
  try {
    publication = await loadOwnedPublication(db, { userId, token: parsed.data.token });
    if (!publication) throw createError.notFound('That published artifact does not exist.');

    const [target] = await db.query<PublishedVersionRow>(
      `select id, version, title, kind, language, content, created_at
         from public.published_artifact_versions
        where published_artifact_id = $1 and user_id = $2 and version = $3
        limit 1`,
      [publication.id, userId, parsed.data.version],
    );
    if (!target) {
      throw createError.notFound(`Version ${parsed.data.version} is not in this artifact history.`);
    }

    const outbound = await inspectOutboundContent({
      channel: 'artifact_publish',
      value: target.content,
      userId,
      organizationId,
      resourceId: publication.artifactId,
      resolveMode: () => resolveSecretHandlingPolicy(db, userId),
    });
    if (outbound.action === 'blocked') {
      throw createError.validation(outbound.message);
    }

    await publishArtifactRecord(db, {
      userId,
      artifactId: publication.artifactId,
      title: target.title,
      kind: target.kind,
      conversationId: publication.conversationId,
      ...(target.language ? { language: target.language } : {}),
      content: outbound.value,
    });

    restored = await recordPublishedVersion(db, {
      publishedArtifactId: publication.id,
      userId,
      title: target.title,
      kind: target.kind,
      language: target.language,
      content: outbound.value,
    });
  } catch (error) {
    if (error instanceof PublishedArtifactValidationError) {
      throw createError.validation(error.message);
    }
    if (error instanceof PublishedArtifactOwnershipError) {
      throw createError.forbidden(error.message);
    }
    if (isPublishedArtifactSchemaUnavailable(error)) return publishingUnavailableResponse();
    throw error;
  }

  return NextResponse.json({
    token: parsed.data.token,
    shareUrl: buildPublishedArtifactUrl(parsed.data.token),
    restoredFrom: parsed.data.version,
    version: restored,
  });
}

async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;

  const versionsToken = new URL(request.url).searchParams.get('versionsOf');
  if (versionsToken) {
    if (!PUBLISHED_TOKEN_REGEX.test(versionsToken)) {
      throw createError.validation('versionsOf must be a published artifact token');
    }
    return handleListVersions(request, versionsToken);
  }

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
export const PATCH = withCorsRoute(withErrorHandler(handleRestore));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
