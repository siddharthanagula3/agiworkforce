import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, logSecurityEvent } from '@/lib/security-audit';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import { revokeScimToken } from '@/lib/server/scim/scim-token-service';
import {
  isDirectorySyncAccessFailure,
  requireDirectorySyncAdmin,
} from '../../directory-sync-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ tokenId: string }> };

/**
 * DELETE /api/admin/directory-sync/tokens/{tokenId}
 *
 * Revokes a SCIM bearer token. Soft-delete via `revoked_at`, so the record of
 * which credential an IdP was using survives the revocation, and the very next
 * SCIM request presenting it fails authentication (the verification query
 * filters on `revoked_at is null`).
 *
 * Scoped by organization in the UPDATE predicate: one tenant can never revoke
 * another's credential, and an unknown or foreign id is a 404 either way.
 */
export async function DELETE(request: NextRequest, routeContext: RouteContext) {
  const rateLimited = await withRateLimit(request, 'scim-token-manage');
  if (rateLimited) return rateLimited;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  try {
    const { tokenId } = await routeContext.params;

    const access = await requireDirectorySyncAdmin(
      request,
      new URL(request.url).searchParams.get('organizationId'),
    );
    if (isDirectorySyncAccessFailure(access)) return access.response;

    if (!UUID_PATTERN.test(tokenId)) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    const revoked = await revokeScimToken(getNeonDb(), tokenId, access.organizationId);

    if (!revoked) {
      // Unknown, another tenant's, or already revoked — all indistinguishable.
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    await logSecurityEvent({
      userId: access.userId,
      eventType: 'admin_action',
      severity: 'high',
      ipAddress: getClientIp(request),
      endpoint: '/api/admin/directory-sync/tokens',
      details: {
        action: 'scim_token_revoked',
        tokenId,
        organizationId: access.organizationId,
      },
    });

    return NextResponse.json({ success: true, id: tokenId });
  } catch (error) {
    logger.error({ error }, 'Error revoking SCIM token');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
