import 'server-only';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';

const CLERK_SESSION_ID = /^sess_[A-Za-z0-9]+$/;

async function handleRevoke(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-session-revoke');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const authResult = await auth();
  if (!authResult.userId || !authResult.sessionId) {
    throw createError.unauthorized('Authentication required');
  }

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
  if (target.userId !== authResult.userId) {
    throw createError.notFound('Session not found');
  }

  if (target.status === 'active') {
    await client.sessions.revokeSession(target.id);
  }

  const isCurrent = target.id === authResult.sessionId;
  logger.info(
    { userId: authResult.userId, sessionId: target.id, isCurrent },
    'Account session revoked',
  );
  return NextResponse.json({
    message: target.status === 'active' ? 'Session revoked' : 'Session was already inactive',
    isCurrent,
  });
}

export const DELETE = withErrorHandler(handleRevoke);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
