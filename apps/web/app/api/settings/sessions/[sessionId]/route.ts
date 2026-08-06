/**
 * DELETE /api/settings/sessions/[sessionId] · end one active Clerk session.
 *
 * Reachable by the same three first-party callers as the collection route (web
 * cookie, Mobile Clerk JWT, Desktop device bearer) — see `../session-principal`
 * for how each one's "is this my own session" answer is resolved.
 */
import 'server-only';

import { clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { resolveSessionsPrincipal } from '../session-principal';

const CLERK_SESSION_ID = /^sess_[A-Za-z0-9]+$/;

async function handleRevoke(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-session-revoke');
  if (rateLimitResponse) return rateLimitResponse;

  // Auth before CSRF, per the ordering invariant documented in lib/csrf.ts.
  const { userId, currentSessionId } = await resolveSessionsPrincipal(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { sessionId } = await context.params;
  if (!CLERK_SESSION_ID.test(sessionId) || sessionId.length > 128) {
    throw createError.validation('Invalid session ID');
  }

  const client = await clerkClient();
  let target;
  try {
    target = await client.sessions.getSession(sessionId);
  } catch {
    throw createError.notFound('Session not found');
  }
  if (target.userId !== userId) {
    throw createError.notFound('Session not found');
  }

  if (target.status === 'active') {
    await client.sessions.revokeSession(target.id);
  }

  // A device-token caller has no Clerk session, so it can never be revoking its
  // own: `isCurrent` stays false and the client is not told to sign itself out.
  const isCurrent = currentSessionId !== null && target.id === currentSessionId;
  logger.info({ userId, sessionId: target.id, isCurrent }, 'Account session revoked');

  await recordAuditEvent({
    userId,
    eventType: 'session_revoked',
    request,
    detail: {
      resourceType: 'session',
      isCurrent,
      status: target.status === 'active' ? 'revoked' : 'already_inactive',
    },
  });

  return NextResponse.json({
    message: target.status === 'active' ? 'Session revoked' : 'Session was already inactive',
    isCurrent,
  });
}

export const DELETE = withErrorHandler(handleRevoke);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
