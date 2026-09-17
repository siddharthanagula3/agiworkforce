import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  requireOrganizationPermission,
  SHARE_INTO_WORKSPACE_DENIED_MESSAGE,
} from '@/lib/services/organization-permission-service';
import {
  isArtifactSharingSchemaUnavailable,
  resolveArtifactShareTarget,
  shareArtifactWithOrganization,
  unshareArtifactFromOrganization,
} from '@/lib/services/org-shared-artifact-service';
import {
  PUBLISHED_ARTIFACT_VISIBILITIES,
  PUBLISHED_TOKEN_REGEX,
  buildPublishedArtifactUrl,
  setPublishedArtifactVisibility,
  unpublishArtifactRecord,
} from '@/lib/services/published-artifact-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ token: string }> };

const VisibilitySchema = z.object({
  visibility: z.enum(PUBLISHED_ARTIFACT_VISIBILITIES),
});

function sharingUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        message: 'Workspace sharing for artifacts is not configured in this environment yet.',
      },
    },
    { status: 503 },
  );
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

/**
 * Move a published artifact between audiences.
 *
 * `organization` mints the grant row and closes the anonymous token page;
 * `public` drops the grant row and reopens it. Both writes run through the
 * RLS-scoped adapter, so 0184's policies, not this handler, decide whether the
 * caller may touch the row at all.
 */
async function handleSetVisibility(request: NextRequest, context: RouteContext): Promise<Response> {
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

  const parsed = VisibilitySchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid artifact visibility request', parsed.error.flatten());
  }

  const { db, userId } = await getUserScopedDb(request);
  const visibility = parsed.data.visibility;

  try {
    const target = await resolveArtifactShareTarget(db, { userId, token });

    if (visibility === 'organization') {
      await requireOrganizationPermission(
        userId,
        target.organizationId,
        'content.share',
        SHARE_INTO_WORKSPACE_DENIED_MESSAGE,
      );
      await shareArtifactWithOrganization(db, {
        organizationId: target.organizationId,
        publishedArtifactId: target.publishedArtifactId,
        actorUserId: userId,
      });
    } else {
      await unshareArtifactFromOrganization(db, target.organizationId, target.publishedArtifactId);
    }

    const updated = await setPublishedArtifactVisibility(db, { userId, token, visibility });
    if (!updated) {
      throw createError.notFound('Published artifact not found');
    }

    return NextResponse.json({
      token: updated.token,
      shareUrl: buildPublishedArtifactUrl(updated.token),
      visibility: updated.visibility,
      organizationId: visibility === 'organization' ? target.organizationId : null,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    if (isArtifactSharingSchemaUnavailable(error)) return sharingUnavailableResponse();
    throw error;
  }
}

export const DELETE = withErrorHandler(handleUnpublish);
export const PATCH = withErrorHandler(handleSetVisibility);
