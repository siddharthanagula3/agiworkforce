import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { resolveSessionsPrincipal } from '../session-principal';
import { getIdentityProvider } from '@/lib/server/identity';
import { SESSION_STATUS_ACTIVE } from '@/lib/server/session-status';

const PROVIDER_SESSION_ID = /^sess_[A-Za-z0-9]+$/;

async function handleRevoke(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-session-revoke');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, currentSessionId } = await resolveSessionsPrincipal(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { sessionId } = await context.params;
  if (!PROVIDER_SESSION_ID.test(sessionId) || sessionId.length > 128) {
    throw createError.validation('Invalid session ID');
  }

  const identity = getIdentityProvider();
  let target;
  try {
    target = await identity.getSession(sessionId);
  } catch {
    throw createError.notFound('Session not found');
  }
  if (!target || target.userId !== userId) {
    throw createError.notFound('Session not found');
  }

  if (target.status === SESSION_STATUS_ACTIVE) {
    await identity.revokeSession(target.id);
  }

  const isCurrent = currentSessionId !== null && target.id === currentSessionId;
  logger.info({ userId, sessionId: target.id, isCurrent }, 'Account session revoked');

  await recordAuditEvent({
    userId,
    eventType: 'session_revoked',
    request,
    detail: {
      resourceType: 'session',
      isCurrent,
      status: target.status === SESSION_STATUS_ACTIVE ? 'revoked' : 'already_inactive',
    },
  });

  return NextResponse.json({
    message:
      target.status === SESSION_STATUS_ACTIVE ? 'Session revoked' : 'Session was already inactive',
    isCurrent,
  });
}

export const DELETE = withErrorHandler(handleRevoke);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
