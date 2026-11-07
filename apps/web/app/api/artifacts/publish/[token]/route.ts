import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ManagedCloudPublishedArtifactUpdateRequestSchema,
  type ManagedCloudPublishedArtifactUpdateResponse,
  type ManagedCloudPublishedArtifactDetailResponse,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { describePublishedArtifactWorkspace } from '@/lib/services/published-artifact-workspace';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { buildExternalSharingGateResponse } from '@/lib/managed-compute-gate';
import { moderateManagedPrompt } from '@/lib/moderation';
import { inspectOutboundContent } from '@/lib/security/outbound-content-inspection';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import { updatePublishedArtifactAudience } from '@/lib/services/org-shared-artifact-service';
import {
  CONNECTOR_ARTIFACT_PUBLIC_SHARE_MESSAGE,
  PUBLISHED_TOKEN_REGEX,
  buildPublishedArtifactUrl,
  getOwnedPublishedArtifactSummary,
  requiresSandboxedRender,
  publicationUsesConnectors,
  renamePublishedArtifact,
  unpublishArtifactRecord,
  type PublishedArtifact,
} from '@/lib/services/published-artifact-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ token: string }> };

async function handleDetail(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token } = await context.params;
  if (!PUBLISHED_TOKEN_REGEX.test(token)) throw createError.notFound('Published artifact not found');
  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const artifact = await getOwnedPublishedArtifactSummary(db, { userId, token });
  if (!artifact) throw createError.notFound('Published artifact not found');
  const body: ManagedCloudPublishedArtifactDetailResponse = {
    artifact: {
      ...artifact,
      shareUrl: buildPublishedArtifactUrl(artifact.token),
      sandboxed: requiresSandboxedRender(artifact.kind),
    },
    workspace: await describePublishedArtifactWorkspace(db, organizationId),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function handleUnpublish(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token } = await context.params;

  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    throw createError.notFound('Published artifact not found');
  }

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const deleted = await unpublishArtifactRecord(db, { userId, token });

  if (!deleted) {
    throw createError.notFound('Published artifact not found');
  }

  return NextResponse.json({ success: true, token });
}

class PublicationSharingGateError extends Error {
  constructor(readonly response: NextResponse) {
    super('Published artifact external sharing was refused');
  }
}

async function readPublicationOrganizationIds(
  db: DatabaseAdapter,
  publication: PublishedArtifact,
  sharedOrganizationId: string | null,
): Promise<(string | null)[]> {
  const rows = await db.query<{ organization_id: string | null }>(
    `select organization_id
       from public.web_conversations
      where id = $1 and user_id = $2`,
    [publication.conversationId, publication.userId],
  );
  const organizationIds = rows.map((row) => row.organization_id ?? null);
  if (sharedOrganizationId) organizationIds.push(sharedOrganizationId);
  return organizationIds;
}

async function inspectedTitle(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  token: string;
  title: string;
}): Promise<string> {
  const moderation = moderateManagedPrompt({
    userId: input.userId,
    segments: [input.title],
    surface: 'published-artifact',
  });
  if (!moderation.allowed) {
    throw createError.validation(
      'This name cannot be used because it violates the AGI Workforce usage policy.',
    );
  }
  const outbound = await inspectOutboundContent({
    channel: 'artifact_publish',
    value: input.title,
    userId: input.userId,
    organizationId: input.organizationId,
    resourceId: input.token,
    resolveMode: () => resolveSecretHandlingPolicy(input.db, input.userId),
  });
  if (outbound.action === 'blocked') throw createError.validation(outbound.message);
  return outbound.value;
}

async function handleUpdate(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token } = await context.params;

  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    throw createError.notFound('Published artifact not found');
  }

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

  const parsed = ManagedCloudPublishedArtifactUpdateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid published artifact update', parsed.error.flatten());
  }

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const { visibility, title } = parsed.data;

  const nextTitle =
    title === undefined
      ? undefined
      : await inspectedTitle({ db, userId, organizationId, token, title });

  let updated: PublishedArtifact | null = null;
  let sharedWith: string | null = null;
  if (visibility !== undefined) {
    try {
      const moved = await updatePublishedArtifactAudience(db, {
        userId,
        token,
        visibility,
        organizationId,
        title: nextTitle,
        authorize: async ({ db: tx, publication, sharedOrganizationId }) => {
          if (visibility !== 'public') return;
          if (await publicationUsesConnectors(tx, { userId, token: publication.token })) {
            throw createError.conflict(CONNECTOR_ARTIFACT_PUBLIC_SHARE_MESSAGE);
          }
          const sharingGateResponse = await buildExternalSharingGateResponse(
            userId,
            request,
            await readPublicationOrganizationIds(tx, publication, sharedOrganizationId),
          );
          if (sharingGateResponse) throw new PublicationSharingGateError(sharingGateResponse);
        },
      });
      updated = moved.updated;
      sharedWith = moved.organizationId;
    } catch (error) {
      if (error instanceof PublicationSharingGateError) return error.response;
      throw error;
    }
  } else if (nextTitle !== undefined) {
    updated = await renamePublishedArtifact(db, { userId, token, title: nextTitle });
  }
  if (!updated) {
    throw createError.notFound('Published artifact not found');
  }

  const body: ManagedCloudPublishedArtifactUpdateResponse = {
    token: updated.token,
    shareUrl: buildPublishedArtifactUrl(updated.token),
    title: updated.title,
    visibility: updated.visibility,
    organizationId: sharedWith,
    updatedAt: updated.updatedAt,
  };
  return NextResponse.json(body);
}

export const DELETE = withErrorHandler(handleUnpublish);
export const PATCH = withErrorHandler(handleUpdate);

export const GET = withCorsRoute(withErrorHandler(handleDetail));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
