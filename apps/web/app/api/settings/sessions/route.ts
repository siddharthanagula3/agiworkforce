import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { resolveSessionsPrincipal } from './session-principal';
import type { IdentitySession } from '@agiworkforce/identity';
import { getIdentityProvider } from '@/lib/server/identity';
import {
  listActiveIdentitySessions,
  revokeEveryOtherSession,
  revokeInBatches,
  type IdentitySessionOperations,
} from '@/lib/server/session-revocation';
import { revokeEveryDeviceRefreshCredential } from '@/lib/server/refresh-token-family';
import { hasOutlivedAbsoluteLifetime, sessionAbsoluteDeadline } from '@/lib/auth/session-policy';
import { isRegistryMissing } from '../devices/schema-state';

function toIsoTimestamp(timestamp: number | null): string | null {
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The provider's activity record carries a device type but no OS and no
 * surface; the registry (0207) holds both, keyed by the identity session.
 */
interface SessionDevice {
  os: string;
  osVersion: string | null;
  surface: string;
}

const SESSION_DEVICES = `
  select identity_session_id, surface, os, os_version
    from device_registrations
   where user_id = $1
     and identity_session_id is not null`;

const WEB_SURFACE = 'web';

async function readSessionDevices(
  db: Awaited<ReturnType<typeof resolveSessionsPrincipal>>['db'],
  userId: string,
): Promise<Map<string, SessionDevice>> {
  try {
    const rows = await db.query<{
      identity_session_id: string;
      surface: string;
      os: string;
      os_version: string | null;
    }>(SESSION_DEVICES, [userId]);
    return new Map(
      rows.map((row) => [
        row.identity_session_id,
        { os: row.os, osVersion: row.os_version, surface: row.surface },
      ]),
    );
  } catch (error) {
    if (isRegistryMissing(error)) return new Map();
    throw error;
  }
}

function serializeSession(
  session: IdentitySession,
  currentSessionId: string | null,
  device: SessionDevice | undefined,
) {
  const activity = session.latestActivity;
  const deviceName =
    activity?.deviceType?.trim() || (activity?.isMobile ? 'Mobile device' : 'Browser');
  const browser = [activity?.browserName?.trim(), activity?.browserVersion?.trim()]
    .filter(Boolean)
    .join(' ');
  const location = [activity?.city?.trim(), activity?.country?.trim()].filter(Boolean).join(', ');

  return {
    id: session.id,
    status: session.status,
    device: deviceName,
    os: device?.os ?? null,
    osVersion: device?.osVersion ?? null,
    // Every other surface registers before use, so an unclaimed session is not
    // an unknown surface: it is the web app, the one that does not register.
    surface: device?.surface ?? WEB_SURFACE,
    browser: browser || null,
    location: location || null,
    createdAt: toIsoTimestamp(session.createdAt),
    lastActiveAt: toIsoTimestamp(session.lastActiveAt),
    expiresAt: toIsoTimestamp(session.expireAt),
    absoluteExpiresAt: toIsoTimestamp(sessionAbsoluteDeadline(session.createdAt)),
    isCurrent: currentSessionId !== null && session.id === currentSessionId,
  };
}

/**
 * The provider's expiry renews on use, so only this ends a sign-in that is
 * older than policy allows but still active.
 */
async function endSessionsPastAbsoluteLifetime(
  identity: IdentitySessionOperations,
  sessions: IdentitySession[],
  now: number,
): Promise<{ live: IdentitySession[]; endedCount: number }> {
  const expired = sessions.filter((session) => hasOutlivedAbsoluteLifetime(session.createdAt, now));
  if (expired.length === 0) return { live: sessions, endedCount: 0 };

  const outcome = await revokeInBatches(identity, expired);
  const ended = new Set([...outcome.ended, ...outcome.alreadyGone]);
  return {
    live: sessions.filter((session) => !ended.has(session.id)),
    endedCount: ended.size,
  };
}

async function handleList(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-sessions-list');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, currentSessionId } = await resolveSessionsPrincipal(request);
  const identity = getIdentityProvider();
  const { sessions, totalCount, truncated } = await listActiveIdentitySessions(identity, userId);

  const { live, endedCount } = await endSessionsPastAbsoluteLifetime(
    identity,
    sessions,
    Date.now(),
  );
  const devices = await readSessionDevices(db, userId);

  const projected = live
    .map((session) => serializeSession(session, currentSessionId, devices.get(session.id)))
    .sort((left, right) => {
      if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
      return (right.lastActiveAt ?? '').localeCompare(left.lastActiveAt ?? '');
    });

  if (endedCount > 0) {
    await recordAuditEvent({
      userId,
      eventType: 'session_revoked',
      request,
      detail: {
        source: 'absolute_session_timeout',
        resourceType: 'session',
        count: endedCount,
      },
    });
  }

  return NextResponse.json({
    sessions: projected,
    totalCount: Math.max(0, totalCount - endedCount),
    returnedCount: projected.length,
    truncated,
    endedByAbsoluteTimeout: endedCount,
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
  await revokeEveryDeviceRefreshCredential(db, userId);

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
