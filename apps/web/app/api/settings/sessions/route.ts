/**
 * GET    /api/settings/sessions · list this account's active Clerk sessions
 * DELETE /api/settings/sessions · end every active session ("log out everywhere")
 *
 * Callers of GET: the web Account section
 * (`apps/web/features/settings/sections/AccountSection.tsx`, Clerk cookie),
 * Mobile Account Security
 * (`apps/mobile/src/features/settings/account-security/service.ts`, Clerk
 * session JWT), and Desktop (`apps/desktop/src/api/cloudAccountSettings.ts`,
 * first-party HS256 device bearer). DELETE ("log out everywhere") is called by
 * web and Desktop only — Mobile revokes individual devices through
 * `./[sessionId]` and ends its own session through the Clerk sign-out flow.
 *
 * Identity and the current-session marker are resolved in `./session-principal`;
 * read that file for why a device-token caller is honestly told no listed row is
 * itself instead of having one guessed for it.
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
import { resolveSessionsPrincipal } from './session-principal';

const PAGE_SIZE = 100;
const MAX_SESSION_PAGES = 20;
const REVOKE_BATCH_SIZE = 10;

type ClerkClient = Awaited<ReturnType<typeof clerkClient>>;
type ClerkSession = Awaited<ReturnType<ClerkClient['sessions']['getSession']>>;

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

function serializeSession(session: ClerkSession, currentSessionId: string | null) {
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
    // `currentSessionId === null` means the caller holds a credential that is
    // not a Clerk session (Desktop's device token), so nothing here is "this
    // device" and nothing may claim to be.
    isCurrent: currentSessionId !== null && session.id === currentSessionId,
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

  const { userId, currentSessionId } = await resolveSessionsPrincipal(request);
  const sessions = await listActiveClerkSessions(await clerkClient(), userId);
  const projected = sessions
    .map((session) => serializeSession(session, currentSessionId))
    .sort((left, right) => {
      if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
      return (right.lastActiveAt ?? '').localeCompare(left.lastActiveAt ?? '');
    });

  return NextResponse.json({
    sessions: projected,
    totalCount: projected.length,
    // Lets a client distinguish "none of these is you" from "we could not tell".
    // The browser and Mobile always get true; Desktop's device token gets false
    // and renders an explanation instead of a missing-row mystery.
    currentSessionKnown: currentSessionId !== null,
  });
}

async function handleRevokeAll(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-session-revoke');
  if (rateLimitResponse) return rateLimitResponse;

  // Credential verification runs BEFORE the CSRF helper is allowed to treat a
  // Bearer request as safe — the ordering `lib/csrf.ts` documents as required.
  const { userId, currentSessionId } = await resolveSessionsPrincipal(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const client = await clerkClient();
  const sessions = await listActiveClerkSessions(client, userId);
  // When the caller has no Clerk session of its own (Desktop device token),
  // every listed session is "another device" and all of them are revoked. The
  // caller's own credential is a developer token, revoked separately through
  // POST /api/auth/logout when the client signs itself out.
  const currentSession = currentSessionId
    ? sessions.find((session) => session.id === currentSessionId)
    : undefined;
  const otherSessions = sessions.filter((session) => session.id !== currentSession?.id);
  const result = await revokeInBatches(client, otherSessions);

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
    await client.sessions.revokeSession(currentSession.id);
    result.revoked.push(currentSession.id);
  }

  logger.info({ userId, revokedCount: result.revoked.length }, 'All active sessions revoked');

  // Audit: "log out everywhere". Only the count is recorded — session ids are
  // bearer-adjacent handles and stay out of the audit row.
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
    // false ⇒ the caller's own credential was not one of the revoked sessions
    // and the client still has to end its own session locally.
    currentSessionRevoked: currentSession !== undefined,
  });
}

export const GET = withErrorHandler(handleList);
export const DELETE = withErrorHandler(handleRevokeAll);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
