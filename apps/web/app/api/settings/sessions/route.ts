import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { resolveSessionsPrincipal } from './session-principal';
import type { IdentityProvider, IdentitySession } from '@agiworkforce/identity';

type IdentitySessionOperations = Pick<IdentityProvider, 'listUserSessions' | 'revokeSession'>;
import { getIdentityProvider } from '@/lib/server/identity';
import { SESSION_STATUS_ACTIVE } from '@/lib/server/session-status';

const PAGE_SIZE = 100;
const REVOKE_BATCH_SIZE = 10;
const MAX_REVOKE_PASSES = 200;

export interface ActiveIdentitySessions {
  sessions: IdentitySession[];
  totalCount: number;
  truncated: boolean;
}

/**
 * One page, plus what the provider says the account holds. Walking every page
 * used to end in a 503 with a Retry that could never succeed, and reading the
 * pages instead of throwing merely traded that for a provider rate limit: on an
 * account with three thousand sessions the twenty reads this took per view
 * returned 429 and the pane failed again. The count carries the rest.
 */
export async function listActiveIdentitySessions(
  identity: IdentitySessionOperations,
  userId: string,
): Promise<ActiveIdentitySessions> {
  const response = await identity.listUserSessions(userId, {
    status: SESSION_STATUS_ACTIVE,
    limit: PAGE_SIZE,
    offset: 0,
  });
  const sessions = [...response.sessions];
  const totalCount = Math.max(response.totalCount, sessions.length);

  return { sessions, totalCount, truncated: sessions.length < totalCount };
}

interface RevokeSweep {
  revoked: string[];
  failed: string[];
  currentSession: IdentitySession | undefined;
  incomplete: boolean;
}

async function revokeEveryOtherSession(
  identity: IdentitySessionOperations,
  userId: string,
  currentSessionId: string | null,
): Promise<RevokeSweep> {
  const revoked: string[] = [];
  const failed: string[] = [];
  const attempted = new Set<string>();
  let currentSession: IdentitySession | undefined;

  // A revoked session leaves the active list, so the first page always holds
  // the next batch of work and the whole account never has to be in memory.
  // The attempted set stops a session the provider refuses to revoke from being
  // retried for ever.
  for (let pass = 0; pass < MAX_REVOKE_PASSES; pass++) {
    const page = await identity.listUserSessions(userId, {
      status: SESSION_STATUS_ACTIVE,
      limit: PAGE_SIZE,
      offset: 0,
    });

    currentSession =
      page.sessions.find((session) => session.id === currentSessionId) ?? currentSession;

    const pending = page.sessions.filter(
      (session) => session.id !== currentSessionId && !attempted.has(session.id),
    );
    if (pending.length === 0) return { revoked, failed, currentSession, incomplete: false };

    for (const session of pending) attempted.add(session.id);
    const outcome = await revokeInBatches(identity, pending);
    revoked.push(...outcome.revoked);
    failed.push(...outcome.failed);
  }

  return { revoked, failed, currentSession, incomplete: true };
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
  const { sessions, totalCount, truncated } = await listActiveIdentitySessions(
    getIdentityProvider(),
    userId,
  );
  const projected = sessions
    .map((session) => serializeSession(session, currentSessionId))
    .sort((left, right) => {
      if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
      return (right.lastActiveAt ?? '').localeCompare(left.lastActiveAt ?? '');
    });

  return NextResponse.json({
    sessions: projected,
    totalCount,
    returnedCount: projected.length,
    truncated,
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
  const result = await revokeEveryOtherSession(identity, userId, currentSessionId);
  const currentSession = result.currentSession;
  await db.execute(
    `update device_refresh_tokens
        set revoked_at = coalesce(revoked_at, now())
      where user_id = $1
        and revoked_at is null`,
    [userId],
  );

  if (result.failed.length > 0 || result.incomplete) {
    logger.error(
      {
        userId,
        revokedCount: result.revoked.length,
        failedCount: result.failed.length,
        incomplete: result.incomplete,
      },
      'Some non-current sessions could not be revoked',
    );
    return NextResponse.json(
      {
        error:
          result.failed.length === 0
            ? 'Not every session ended in one pass. Run it again to finish the rest.'
            : currentSession
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
