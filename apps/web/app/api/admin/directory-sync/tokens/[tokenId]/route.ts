import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, logSecurityEvent, recordAuditEvent } from '@/lib/security-audit';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { revokeScimToken } from '@/lib/server/scim/scim-token-service';
import {
  isDirectorySyncAccessFailure,
  requireDirectorySyncAdmin,
} from '../../directory-sync-access';
import { isUuid } from '@/lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ tokenId: string }> };

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

    if (!isUuid(tokenId)) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    const revoked = await revokeScimToken(access.db, tokenId, access.organizationId);

    if (!revoked) {
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

    await recordAuditEvent({
      userId: access.userId,
      eventType: 'scim_token_revoked',
      organizationId: access.organizationId,
      request,
      severity: 'warning',
      detail: {
        resourceType: 'scim_token',
        resourceId: tokenId,
      },
    });

    return NextResponse.json({ success: true, id: tokenId });
  } catch (error) {
    logger.error({ error }, 'Error revoking SCIM token');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
