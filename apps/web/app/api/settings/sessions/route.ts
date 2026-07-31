import 'server-only';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';

const PAGE_SIZE = 100;
const MAX_SESSION_PAGES = 20;
const REVOKE_BATCH_SIZE = 10;

type ClerkClient = Awaited<ReturnType<typeof clerkClient>>;
type ClerkSession = Awaited<ReturnType<ClerkClient['sessions']['getSession']>>;

async function requireBrowserSession(): Promise<{ userId: string; sessionId: string }> {
  const result = await auth();
  if (!result.userId || !result.sessionId) {
    throw createError.unauthorized('Authentication required');
  }
  return { userId: result.userId, sessionId: result.sessionId };
}

export async function listActiveClerkSessions(
  client: ClerkClient,
  userId: string,
): Promise<ClerkSession[]> {
  const sessions: ClerkSession[] = [];

  for (let pageIndex = 0; pageIndex < MAX_SESSION_PAGES; pageIndex++) {
    const response = await client.sessions.getSessionList({
      userId,
      status: 'active',
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    });
    sessions.push(...response.data);

    if (sessions.length >= response.totalCount || response.data.length < PAGE_SIZE) {
      return sessions;
    }
  }

  throw createError.serviceUnavailable(
    'There are too many active sessions to manage safely. Please contact support.',
  );
}

function toIsoTimestamp(timestamp: number): string | null {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function serializeSession(session: ClerkSession, currentSessionId: string) {
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
    isCurrent: session.id === currentSessionId,
  };
}

async function revokeInBatches(
  client: ClerkClient,
  sessions: ClerkSession[],
): Promise<{ revoked: string[]; failed: string[] }> {
  const revoked: string[] = [];
  const failed: string[] = [];

  for (let index = 0; index < sessions.length; index += REVOKE_BATCH_SIZE) {
    const batch = sessions.slice(index, index + REVOKE_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((session) => client.sessions.revokeSession(session.id)),
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

  const { userId, sessionId } = await requireBrowserSession();
  const sessions = await listActiveClerkSessions(await clerkClient(), userId);
  const projected = sessions
    .map((session) => serializeSession(session, sessionId))
    .sort((left, right) => {
      if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
      return (right.lastActiveAt ?? '').localeCompare(left.lastActiveAt ?? '');
    });

  return NextResponse.json({ sessions: projected, totalCount: projected.length });
}

async function handleRevokeAll(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-session-revoke');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId, sessionId } = await requireBrowserSession();
  const client = await clerkClient();
  const sessions = await listActiveClerkSessions(client, userId);
  const currentSession = sessions.find((session) => session.id === sessionId);
  const otherSessions = sessions.filter((session) => session.id !== sessionId);
  const result = await revokeInBatches(client, otherSessions);

  if (result.failed.length > 0) {
    logger.error(
      { userId, revokedCount: result.revoked.length, failedCount: result.failed.length },
      'Some non-current sessions could not be revoked',
    );
    return NextResponse.json(
      {
        error: 'Some sessions could not be revoked. Your current session remains active.',
        revokedCount: result.revoked.length,
        failedCount: result.failed.length,
      },
      { status: 502 },
    );
  }

  if (currentSession) {
    await client.sessions.revokeSession(currentSession.id);
    result.revoked.push(currentSession.id);
  }

  logger.info({ userId, revokedCount: result.revoked.length }, 'All active sessions revoked');
  return NextResponse.json({
    message: 'All active sessions revoked',
    revokedCount: result.revoked.length,
  });
}

export const GET = withErrorHandler(handleList);
export const DELETE = withErrorHandler(handleRevokeAll);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
