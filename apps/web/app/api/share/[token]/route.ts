import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getNeonDb } from '@/lib/server/neon-db';
import { getCurrentUserRlsDb, getUserScopedDb } from '@/lib/server/rls-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';

import { shareRef } from '@/lib/share-ref';
import {
  getOrgReadableSessionByToken,
  getPublicSharedSessionByToken,
  isConversationSharingSchemaUnavailable,
  resolveSessionShareTarget,
  setSharedSessionVisibility,
  shareSessionWithOrganization,
  unshareSessionFromOrganization,
  SHARED_SESSION_VISIBILITIES,
} from '@/lib/services/org-shared-session-service';

const TOKEN_REGEX = /^[A-Za-z0-9_-]{24}$/;

const VisibilitySchema = z.object({
  visibility: z.enum(SHARED_SESSION_VISIBILITIES),
});

function sharingUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        message: 'Workspace sharing for conversations is not configured in this environment yet.',
      },
    },
    { status: 503 },
  );
}

type RouteContext = { params: Promise<{ token: string }> };

/**
 * Two audiences, in the order that leaks the least. The anonymous lookup
 * answers only for rows still marked `public`, so a workspace-only
 * conversation never serves on its token alone; it then falls through to the
 * signed-in read, where 0186's RLS policy decides whether the caller's
 * organization holds a grant.
 */
async function readSessionForCaller(token: string) {
  const publiclyVisible = await getPublicSharedSessionByToken(getNeonDb(), token).catch(() => null);
  if (publiclyVisible) return publiclyVisible;

  const scoped = await getCurrentUserRlsDb().catch(() => null);
  if (!scoped) return null;
  return getOrgReadableSessionByToken(scoped.db, token).catch(() => null);
}

async function handleGetShare(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;

  if (!TOKEN_REGEX.test(token)) {
    throw createError.notFound('Invalid token');
  }

  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;

  const data = await readSessionForCaller(token);

  if (!data) {
    throw createError.notFound('Shared session not found');
  }

  if (new Date(data.expiresAt).getTime() <= Date.now()) {
    return NextResponse.json(
      {
        error: {
          code: 'SHARE_EXPIRED',
          message: 'This shared conversation has expired.',
          expires_at: data.expiresAt,
        },
      },
      { status: 410 },
    );
  }

  return NextResponse.json({
    id: data.id,
    token: data.token,
    title: data.title,
    model_id: data.modelId,
    provider: data.provider,
    messages: data.messages,
    total_messages: data.messageCount,
    visibility: data.visibility,
    expires_at: data.expiresAt,
    created_at: data.createdAt,
  });
}

async function handleDeleteShare(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;

  if (!TOKEN_REGEX.test(token)) {
    throw createError.notFound('Invalid token');
  }

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  let userId: string;
  try {
    const authResult = await getClerkAuthUser(request);
    userId = authResult.userId;
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    throw createError.unauthorized();
  }

  const db = getNeonDb();

  let deleted: number;
  try {
    deleted = await db.execute('delete from shared_sessions where token = $1 and owner_id = $2', [
      token,
      userId,
    ]);
  } catch (err) {
    logger.error({ err, share: shareRef(token), userId }, 'Failed to revoke shared session');
    throw createError.internal('Failed to revoke share');
  }

  // A caller who merely holds the link must not be told the revocation worked.
  if (deleted === 0) {
    throw createError.notFound('Shared session not found');
  }

  return NextResponse.json({ success: true });
}

/**
 * Move a conversation share between audiences.
 *
 * `organization` mints the grant row and closes the anonymous token page;
 * `public` drops the grant row and reopens it. Both writes run through the
 * RLS-scoped adapter, so 0186's policies, not this handler, decide whether the
 * caller may touch the row at all. The token and the expiry are untouched, so
 * switching back restores the same URL on the same clock.
 */
async function handleSetVisibility(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;

  if (!TOKEN_REGEX.test(token)) {
    throw createError.notFound('Shared session not found');
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
    throw createError.validation('Invalid share visibility request', parsed.error.flatten());
  }

  const { db, userId } = await getUserScopedDb(request);
  const visibility = parsed.data.visibility;

  try {
    const target = await resolveSessionShareTarget(db, { userId, token });

    if (visibility === 'organization') {
      await shareSessionWithOrganization(db, {
        organizationId: target.organizationId,
        sharedSessionId: target.sharedSessionId,
        actorUserId: userId,
      });
    } else {
      await unshareSessionFromOrganization(db, target.organizationId, target.sharedSessionId);
    }

    const updated = await setSharedSessionVisibility(db, { userId, token, visibility });
    if (!updated) {
      throw createError.notFound('Shared session not found');
    }

    const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';
    return NextResponse.json({
      token: updated.token,
      shareUrl: `${appUrl}/share/${updated.token}`,
      visibility: updated.visibility,
      organizationId: visibility === 'organization' ? target.organizationId : null,
      expiresAt: updated.expiresAt,
    });
  } catch (error) {
    if (isConversationSharingSchemaUnavailable(error)) return sharingUnavailableResponse();
    throw error;
  }
}

export const GET = withErrorHandler(handleGetShare);
export const DELETE = withErrorHandler(handleDeleteShare);
export const PATCH = withErrorHandler(handleSetVisibility);
