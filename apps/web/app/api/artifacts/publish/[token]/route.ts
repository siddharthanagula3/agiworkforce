import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ManagedCloudPublishedArtifactUpdateRequestSchema,
  type ManagedCloudPublishedArtifactUpdateResponse,
  type ManagedCloudPublishedArtifactVisibility,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { AppError, createError } from '@/lib/errors';
import {
  getWorkspaceArtifactSharingErrorMessage,
  organizationCanShareArtifacts,
} from '@/lib/services/org-entitlements';
import { resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { buildExternalSharingGateResponse } from '@/lib/managed-compute-gate';
import { moderateManagedPrompt } from '@/lib/moderation';
import { inspectOutboundContent } from '@/lib/security/outbound-content-inspection';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import {
  requireOrganizationPermission,
  SHARE_INTO_WORKSPACE_DENIED_MESSAGE,
} from '@/lib/services/organization-permission-service';
import {
  resolveArtifactShareTarget,
  shareArtifactWithOrganization,
  unshareArtifactFromOrganization,
} from '@/lib/services/org-shared-artifact-service';
import {
  CONNECTOR_ARTIFACT_PUBLIC_SHARE_MESSAGE,
  PUBLISHED_TOKEN_REGEX,
  buildPublishedArtifactUrl,
  publicationUsesConnectors,
  renamePublishedArtifact,
  setPublishedArtifactVisibility,
  unpublishArtifactRecord,
  type PublishedArtifact,
} from '@/lib/services/published-artifact-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ token: string }> };

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

/**
 * The workspaces this publication's content is stored under: the conversation
 * it came from and any workspace it is shared into.
 */
async function readPublicationOrganizationIds(
  db: DatabaseAdapter,
  input: { userId: string; token: string },
): Promise<(string | null)[]> {
  const rows = await db.query<{ organization_id: string | null }>(
    `select conversation.organization_id
       from public.published_artifacts publication
       join public.web_conversations conversation
         on conversation.id = publication.conversation_id
        and conversation.user_id = publication.user_id
      where publication.token = $1 and publication.user_id = $2
     union all
     select share.organization_id
       from public.organization_shared_artifacts share
       join public.published_artifacts publication
         on publication.id = share.published_artifact_id
      where publication.token = $1 and publication.user_id = $2`,
    [input.token, input.userId],
  );
  return rows.map((row) => row.organization_id ?? null);
}

/**
 * Move a published artifact between audiences.
 *
 * `organization` mints the grant row and closes the anonymous token page;
 * `public` drops any grant row and reopens it; `invited` drops any grant row and
 * leaves the page to the people on the viewer list (0372). Every write runs through the
 * RLS-scoped adapter, so 0184's policies, not this handler, decide whether the
 * caller may touch the row at all.
 */
async function moveToAudience(
  db: DatabaseAdapter,
  input: { userId: string; token: string; visibility: ManagedCloudPublishedArtifactVisibility },
): Promise<{ updated: PublishedArtifact | null; organizationId: string | null }> {
  if (input.visibility !== 'organization') {
    const membership = await resolveOrgMembership(db, input.userId);
    if (membership) {
      const target = await resolveArtifactShareTarget(db, {
        userId: input.userId,
        token: input.token,
      });
      await unshareArtifactFromOrganization(db, target.organizationId, target.publishedArtifactId);
    }
    return { updated: await setPublishedArtifactVisibility(db, input), organizationId: null };
  }

  const target = await resolveArtifactShareTarget(db, { userId: input.userId, token: input.token });
  if (!(await organizationCanShareArtifacts(target.organizationId))) {
    throw new AppError('SUBSCRIPTION_REQUIRED', getWorkspaceArtifactSharingErrorMessage(), 403);
  }
  await requireOrganizationPermission(
    input.userId,
    target.organizationId,
    'content.share',
    SHARE_INTO_WORKSPACE_DENIED_MESSAGE,
  );
  await shareArtifactWithOrganization(db, {
    organizationId: target.organizationId,
    publishedArtifactId: target.publishedArtifactId,
    actorUserId: input.userId,
  });

  return {
    updated: await setPublishedArtifactVisibility(db, input),
    organizationId: target.organizationId,
  };
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
  if (visibility === 'public') {
    if (await publicationUsesConnectors(db, { userId, token })) {
      throw createError.conflict(CONNECTOR_ARTIFACT_PUBLIC_SHARE_MESSAGE);
    }
    const sharingGateResponse = await buildExternalSharingGateResponse(
      userId,
      request,
      await readPublicationOrganizationIds(db, { userId, token }),
    );
    if (sharingGateResponse) return sharingGateResponse;
  }
  if (visibility !== undefined) {
    const moved = await moveToAudience(db, { userId, token, visibility });
    updated = moved.updated;
    sharedWith = moved.organizationId;
    if (!updated) throw createError.notFound('Published artifact not found');
  }
  if (nextTitle !== undefined) {
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
