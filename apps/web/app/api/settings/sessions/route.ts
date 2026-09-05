import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { resolveSessionsPrincipal } from './session-principal';
import type { IdentityProvider, IdentitySession } from '@agiworkforce/identity';

type IdentitySessionOperations = Pick<IdentityProvider, 'listUserSessions' | 'revokeSession'>;
import { getIdentityProvider } from '@/lib/server/identity';
import { SESSION_STATUS_ACTIVE } from '@/lib/server/session-status';

const PAGE_SIZE = 100;
const MAX_SESSION_PAGES = 20;
const REVOKE_BATCH_SIZE = 10;

export async function listActiveIdentitySessions(
  identity: IdentitySessionOperations,
  userId: string,
): Promise<IdentitySession[]> {
  const sessions: IdentitySession[] = [];

  for (let pageIndex = 0; pageIndex < MAX_SESSION_PAGES; pageIndex++) {
    const response = await identity.listUserSessions(userId, {
      status: SESSION_STATUS_ACTIVE,
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    });
    sessions.push(...response.sessions);

    if (sessions.length >= response.totalCount || response.sessions.length < PAGE_SIZE) {
      return sessions;
    }
  }

  throw createError.serviceUnavailable(
    'There are too many active sessions to manage safely. Please contact support.',
  );
}

function toIsoTimestamp(timestamp: number | null): string | null {
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function serializeSession(session: IdentitySession, currentSessionId: string | null) {
  const activity = session.latestActivity;
  const device = activity?.deviceType?.trim() || (activity?.isMobile ? 'Mobile device' : 'Browser');
  const browser = [activity?.browserName?.trim(), activity?.browserVersion?.trim()]
    .filter(Boolean)
    .join(' ');
  const location = [activity?.city?.trim(), activity?.country?.trim()].filter(Boolean).join(', ');

  return {
    id: session.id,
    status: session.status,
    device,
    browser: browser || null,
    location: location || null,
    createdAt: toIsoTimestamp(session.createdAt),
    lastActiveAt: toIsoTimestamp(session.lastActiveAt),
    expiresAt: toIsoTimestamp(session.expireAt),
    isCurrent: currentSessionId !== null && session.id === currentSessionId,
  };
}

async function revokeInBatches(
  identity: IdentitySessionOperations,
  sessions: IdentitySession[],
): Promise<{ revoked: string[]; failed: string[] }> {
  const revoked: string[] = [];
  const failed: string[] = [];

  for (let index = 0; index < sessions.length; index += REVOKE_BATCH_SIZE) {
    const batch = sessions.slice(index, index + REVOKE_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((session) => identity.revokeSession(session.id)),
    );
    results.forEach((result, resultIndex) => {
      const id = batch[resultIndex]?.id;
      if (!id) return;
      if (result.status === 'fulfilled') revoked.push(id);
      else failed.push(id);
    });
  }

  return { revoked, failed };
}

async function handleList(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-sessions-list');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, currentSessionId } = await resolveSessionsPrincipal(request);
  const sessions = await listActiveIdentitySessions(getIdentityProvider(), userId);
  const projected = sessions
    .map((session) => serializeSession(session, currentSessionId))
    .sort((left, right) => {
      if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
      return (right.lastActiveAt ?? '').localeCompare(left.lastActiveAt ?? '');
    });

  return NextResponse.json({
    sessions: projected,
    totalCount: projected.length,
    currentSessionKnown: currentSessionId !== null,
  });
}

async function handleRevokeAll(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-session-revoke');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, currentSessionId } = await resolveSessionsPrincipal(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const identity = getIdentityProvider();
  const sessions = await listActiveIdentitySessions(identity, userId);
  const currentSession = currentSessionId
    ? sessions.find((session) => session.id === currentSessionId)
    : undefined;
  const otherSessions = sessions.filter((session) => session.id !== currentSession?.id);
  const result = await revokeInBatches(identity, otherSessions);
  await db.execute(
    `update device_refresh_tokens
        set revoked_at = coalesce(revoked_at, now())
      where user_id = $1
        and revoked_at is null`,
    [userId],
  );

  if (result.failed.length > 0) {
    logger.error(
      { userId, revokedCount: result.revoked.length, failedCount: result.failed.length },
      'Some non-current sessions could not be revoked',
    );
    return NextResponse.json(
      {
        error: currentSession
          ? 'Some sessions could not be revoked. Your current session remains active.'
          : 'Some sessions could not be revoked. Please try again.',
        revokedCount: result.revoked.length,
        failedCount: result.failed.length,
      },
      { status: 502 },
    );
  }

  if (currentSession) {
    await identity.revokeSession(currentSession.id);
    result.revoked.push(currentSession.id);
  }

  logger.info({ userId, revokedCount: result.revoked.length }, 'All active sessions revoked');

  await recordAuditEvent({
    userId,
    eventType: 'logout',
    request,
    detail: {
      source: 'revoke_all_sessions',
      resourceType: 'session',
      count: result.revoked.length,
      isCurrent: currentSession !== undefined,
    },
  });

  return NextResponse.json({
    message: 'All active sessions revoked',
    revokedCount: result.revoked.length,
    currentSessionRevoked: currentSession !== undefined,
  });
}

export const GET = withErrorHandler(handleList);
export const DELETE = withErrorHandler(handleRevokeAll);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
