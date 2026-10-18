import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { CloudCodeSessionReply } from '@agiworkforce/cloud-contracts';
import { requireCsrfToken } from '@/lib/csrf';
import { recordAuditEvent } from '@/lib/security-audit';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { closeCloudCodeSession } from '@/lib/services/cloud-code-session-service';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { rethrowCloudCodeError } from '@/lib/services/cloud-code-session-errors';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ sessionId: string }> };

async function handleClose(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const { sessionId } = await context.params;
  const planTier = await resolveEntitledPlanTier(db, userId);
  try {
    const session = await closeCloudCodeSession(
      db,
      { userId, organizationId },
      sessionId,
      planTier,
    );
    await recordAuditEvent({
      userId,
      organizationId,
      request,
      eventType: 'code_session_lifecycle_changed',
      detail: { resourceType: 'code_session', resourceId: sessionId, status: 'closed' },
    });
    const closed: CloudCodeSessionReply = { session };
    return NextResponse.json(closed);
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const POST = withErrorHandler(handleClose);
