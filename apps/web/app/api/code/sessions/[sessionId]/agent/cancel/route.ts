import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { CloudCodeTurnCancellationReply } from '@agiworkforce/cloud-contracts';
import { requireCsrfToken } from '@/lib/csrf';
import { recordAuditEvent } from '@/lib/security-audit';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requestCloudCodeTurnCancellation } from '@/lib/services/cloud-code-agent-service';
import { rethrowCloudCodeError } from '@/lib/services/cloud-code-session-errors';
import { isUuid } from '@/lib/uuid';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ sessionId: string }> };

async function optionalTurnId(request: NextRequest): Promise<string | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const turnId = (body as Record<string, unknown>)['turnId'];
  if (turnId === undefined || turnId === null) return null;
  if (typeof turnId !== 'string' || !isUuid(turnId)) {
    throw createError.validation('"turnId" must be a turn identifier');
  }
  return turnId;
}

async function handleCancel(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const turnId = await optionalTurnId(request);
  const { sessionId } = await context.params;
  try {
    const result = await requestCloudCodeTurnCancellation(
      db,
      { userId, organizationId },
      sessionId,
      turnId,
    );
    await recordAuditEvent({
      userId,
      organizationId,
      request,
      eventType: 'code_session_lifecycle_changed',
      detail: { resourceType: 'code_session', resourceId: sessionId, status: 'cancel_requested' },
    });
    const cancelled: CloudCodeTurnCancellationReply = result;
    return NextResponse.json(cancelled);
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const POST = withErrorHandler(handleCancel);
