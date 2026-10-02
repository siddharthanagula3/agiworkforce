import { NextRequest, NextResponse } from 'next/server';
import {
  ConversationShareAudienceChangeSchema,
  type ConversationShareAudienceResponse,
  type ConversationShareRevoked,
  type SharedConversation,
} from '@agiworkforce/cloud-contracts';
import { getNeonDb } from '@/lib/server/neon-db';
import { getCurrentUserRlsDb, getUserScopedDb } from '@/lib/server/rls-db';
import {
  requireSelectedWorkspace,
  resolveActiveOrganizationId,
} from '@/lib/services/active-workspace-service';
import {
  requireOrganizationPermission,
  SHARE_INTO_WORKSPACE_DENIED_MESSAGE,
} from '@/lib/services/organization-permission-service';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { recordAuditEvent } from '@/lib/security-audit';
import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import { buildExternalSharingGateResponse } from '@/lib/managed-compute-gate';

import { shareRef } from '@/lib/share-ref';
import {
  getOrgReadableSessionByToken,
  getPublicSharedSessionByToken,
  isConversationSharingSchemaUnavailable,
  readSharedSessionScope,
  resolveSessionShareTarget,
  setSharedSessionVisibility,
  SHARE_IN_OTHER_WORKSPACE_MESSAGE,
  shareSessionWithOrganization,
  unshareSessionFromOrganization,
} from '@/lib/services/org-shared-session-service';

const TOKEN_REGEX = /^[A-Za-z0-9_-]{24}$/;
const SHARE_AUDIT_ENDPOINT = '/api/share/[token]';

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

  const shared: SharedConversation = {
    id: data.id,
    token: data.token,
    title: data.title,
    model_id: data.modelId,
    provider: data.provider,
    messages: Array.isArray(data.messages) ? data.messages : [],
    total_messages: data.messageCount,
    visibility: data.visibility,
    expires_at: data.expiresAt,
    created_at: data.createdAt,
  };
  return NextResponse.json(shared);
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
    if (isAuthGateRefusal(authError)) {
      return unauthorizedResponseFor(authError);
    }
    throw createError.unauthorized();
  }

  const db = getNeonDb();

  let deleted: Array<{ id: string }>;
  try {
    deleted = await db.query<{ id: string }>(
      'delete from shared_sessions where token = $1 and owner_id = $2 returning id',
      [token, userId],
    );
  } catch (err) {
    logger.error({ err, share: shareRef(token), userId }, 'Failed to revoke shared session');
    throw createError.internal('Failed to revoke share');
  }

  // A caller who merely holds the link must not be told the revocation worked.
  const revoked = deleted[0];
  if (!revoked) {
    throw createError.notFound('Shared session not found');
  }

  const organizationId = await resolveActiveOrganizationId(db, userId, request).catch(() => null);

  await recordAuditEvent({
    userId,
    organizationId,
    eventType: 'share_link_revoked',
    request,
    endpoint: SHARE_AUDIT_ENDPOINT,
    outcome: 'success',
    severity: 'info',
    detail: { resourceType: 'share_link', resourceId: revoked.id },
  }).catch((error) => {
    logger.error({ error, userId }, 'Failed to record share-link audit event');
  });

  const answer: ConversationShareRevoked = { success: true };
  return NextResponse.json(answer);
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

  const parsed = ConversationShareAudienceChangeSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid share visibility request', parsed.error.flatten());
  }

  const { db, userId } = await getUserScopedDb(request);
  const visibility = parsed.data.visibility;

  try {
    const ownerDb = getNeonDb();
    const stored = await readSharedSessionScope(ownerDb, { userId, token });
    if (!stored) {
      throw createError.notFound('Shared session not found');
    }
    const conversationOrganizationId = stored.conversation?.organizationId ?? null;
    if (stored.conversation) {
      await requireSelectedWorkspace(
        ownerDb,
        userId,
        request,
        conversationOrganizationId,
        SHARE_IN_OTHER_WORKSPACE_MESSAGE,
      );
    }

    const target = await resolveSessionShareTarget(db, { userId, token });
    if (conversationOrganizationId && conversationOrganizationId !== target.organizationId) {
      throw createError.forbidden(SHARE_IN_OTHER_WORKSPACE_MESSAGE).asUserSafe();
    }

    let revoked = false;
    if (visibility === 'organization') {
      await requireOrganizationPermission(
        userId,
        target.organizationId,
        'content.share',
        SHARE_INTO_WORKSPACE_DENIED_MESSAGE,
      );
      await shareSessionWithOrganization(db, {
        organizationId: target.organizationId,
        sharedSessionId: target.sharedSessionId,
        actorUserId: userId,
      });
    } else {
      const sharingGateResponse = await buildExternalSharingGateResponse(userId, request, [
        conversationOrganizationId,
        stored.grantOrganizationId,
      ]);
      if (sharingGateResponse) return sharingGateResponse;
      revoked = await unshareSessionFromOrganization(
        db,
        target.organizationId,
        target.sharedSessionId,
      );
    }

    const updated = await setSharedSessionVisibility(db, { userId, token, visibility });
    if (!updated) {
      throw createError.notFound('Shared session not found');
    }

    if (visibility === 'organization' || revoked) {
      await recordAuditEvent({
        userId,
        organizationId: target.organizationId,
        eventType:
          visibility === 'organization'
            ? 'organization_share_granted'
            : 'organization_share_revoked',
        request,
        endpoint: SHARE_AUDIT_ENDPOINT,
        detail: { resourceType: 'conversation', resourceId: target.sharedSessionId },
      });
    }

    const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';
    const changed: ConversationShareAudienceResponse = {
      token: updated.token,
      shareUrl: `${appUrl}/share/${updated.token}`,
      visibility: updated.visibility,
      organizationId: visibility === 'organization' ? target.organizationId : null,
      expiresAt: updated.expiresAt,
    };
    return NextResponse.json(changed);
  } catch (error) {
    if (isConversationSharingSchemaUnavailable(error)) return sharingUnavailableResponse();
    throw error;
  }
}

export const GET = withErrorHandler(handleGetShare);
export const DELETE = withErrorHandler(handleDeleteShare);
export const PATCH = withErrorHandler(handleSetVisibility);
