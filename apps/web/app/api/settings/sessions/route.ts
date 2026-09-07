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
const REVOKE_MAX_ATTEMPTS = 3;
const REVOKE_BACKOFF_BASE_MS = 500;
const REVOKE_BACKOFF_CEILING_MS = 30_000;
const RATE_LIMITED_STATUS = 429;
const ALREADY_GONE_STATUSES: ReadonlySet<number> = new Set([400, 404]);

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

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function isAlreadyGone(error: unknown): boolean {
  const status = errorStatus(error);
  return status !== null && ALREADY_GONE_STATUSES.has(status);
}

/**
 * Milliseconds to wait before another attempt, or null when the error is not a
 * rate limit and retrying it would only spend another call. The provider sends
 * Retry-After in seconds and the SDK surfaces it as retryAfter; without one this
 * backs off exponentially rather than guessing the provider's window.
 */
function rateLimitDelayMs(error: unknown, attempt: number): number | null {
  if (errorStatus(error) !== RATE_LIMITED_STATUS) return null;
  const retryAfter = (error as { retryAfter?: unknown }).retryAfter;
  if (typeof retryAfter === 'number' && Number.isFinite(retryAfter)) {
    return Math.min(Math.max(retryAfter, 0) * 1000, REVOKE_BACKOFF_CEILING_MS);
  }
  return Math.min(REVOKE_BACKOFF_BASE_MS * 2 ** (attempt - 1), REVOKE_BACKOFF_CEILING_MS);
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

interface RevokeOutcome {
  ended: string[];
  alreadyGone: string[];
  failed: string[];
}

interface RevokeSweep extends RevokeOutcome {
  currentSession: IdentitySession | undefined;
  incomplete: boolean;
  targetCount: number;
}

async function revokeEveryOtherSession(
  identity: IdentitySessionOperations,
  userId: string,
  currentSessionId: string | null,
): Promise<RevokeSweep> {
  const ended: string[] = [];
  const alreadyGone: string[] = [];
  const failed: string[] = [];
  const attempted = new Set<string>();
  let currentSession: IdentitySession | undefined;
  let targetCount = 0;

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

    const foundCurrent = page.sessions.find((session) => session.id === currentSessionId);
    currentSession = foundCurrent ?? currentSession;
    if (pass === 0) {
      const total = Math.max(page.totalCount, page.sessions.length);
      targetCount = Math.max(0, total - (foundCurrent ? 1 : 0));
    }

    const pending = page.sessions.filter(
      (session) => session.id !== currentSessionId && !attempted.has(session.id),
    );
    if (pending.length === 0) {
      return { ended, alreadyGone, failed, currentSession, incomplete: false, targetCount };
    }

    for (const session of pending) attempted.add(session.id);
    const outcome = await revokeInBatches(identity, pending);
    ended.push(...outcome.ended);
    alreadyGone.push(...outcome.alreadyGone);
    failed.push(...outcome.failed);
  }

  return { ended, alreadyGone, failed, currentSession, incomplete: true, targetCount };
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
): Promise<RevokeOutcome> {
  const ended: string[] = [];
  const alreadyGone: string[] = [];
  const failed: string[] = [];
  let queue = sessions.map((session) => ({ id: session.id, attempts: 0 }));

  while (queue.length > 0) {
    const batch = queue.slice(0, REVOKE_BATCH_SIZE);
    queue = queue.slice(REVOKE_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(({ id }) => identity.revokeSession(id)));

    let pauseMs = 0;
    results.forEach((result, index) => {
      const item = batch[index];
      if (!item) return;
      if (result.status === 'fulfilled') {
        ended.push(item.id);
        return;
      }
      // A session the provider has already dropped is not a failure to report
      // back: the user asked for it to be gone and it is gone.
      if (isAlreadyGone(result.reason)) {
        alreadyGone.push(item.id);
        return;
      }
      const attempts = item.attempts + 1;
      const retryMs = rateLimitDelayMs(result.reason, attempts);
      if (retryMs === null || attempts >= REVOKE_MAX_ATTEMPTS) {
        failed.push(item.id);
        return;
      }
      pauseMs = Math.max(pauseMs, retryMs);
      queue.push({ id: item.id, attempts });
    });

    // The rate limit belongs to the account, not to one session, so the whole
    // sweep waits out the window the provider asked for.
    await delay(pauseMs);
  }

  return { ended, alreadyGone, failed };
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

  const settled = result.ended.length + result.alreadyGone.length;

  if (result.failed.length > 0 || result.incomplete) {
    logger.error(
      {
        userId,
        endedCount: result.ended.length,
        alreadyGoneCount: result.alreadyGone.length,
        failedCount: result.failed.length,
        targetCount: result.targetCount,
        incomplete: result.incomplete,
      },
      'Some non-current sessions could not be revoked',
    );
    return NextResponse.json(
      {
        // What actually happened, not a generic apology: the provider rate
        // limits a large account part way through, and the caller needs to know
        // the run made progress and that another one finishes it.
        error: `Ended ${settled} of ${Math.max(result.targetCount, settled + result.failed.length)} sessions, try again to finish.`,
        revokedCount: result.ended.length,
        failedCount: result.failed.length,
        currentSessionRevoked: false,
      },
      { status: 502 },
    );
  }

  const revokedIds = [...result.ended];
  if (currentSession) {
    await identity.revokeSession(currentSession.id);
    revokedIds.push(currentSession.id);
  }

  logger.info(
    { userId, revokedCount: revokedIds.length, alreadyGoneCount: result.alreadyGone.length },
    'All active sessions revoked',
  );

  await recordAuditEvent({
    userId,
    eventType: 'logout',
    request,
    detail: {
      source: 'revoke_all_sessions',
      resourceType: 'session',
      count: revokedIds.length,
      isCurrent: currentSession !== undefined,
    },
  });

  return NextResponse.json({
    message: 'All active sessions revoked',
    revokedCount: revokedIds.length,
    currentSessionRevoked: currentSession !== undefined,
  });
}

export const GET = withErrorHandler(handleList);
export const DELETE = withErrorHandler(handleRevokeAll);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
