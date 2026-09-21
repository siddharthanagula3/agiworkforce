import 'server-only';

import type { IdentityProvider } from '@agiworkforce/identity';

import { logger } from '@/lib/logger';
import { hasOutlivedAbsoluteLifetime } from './session-policy';

export type SessionAgeOperations = Pick<IdentityProvider, 'getSession' | 'revokeSession'>;

// A session's start never changes, so one lookup answers for every later request.
// Bounded: the oldest entry goes first and is simply looked up again.
const SESSION_START_CACHE_LIMIT = 5_000;

const sessionStarts = new Map<string, number | null>();

let unreadableStarts = 0;

/** Sessions whose start could not be read, so their age was never measured. */
export function unreadableSessionStartCount(): number {
  return unreadableStarts;
}

export function resetSessionStartCache(): void {
  sessionStarts.clear();
  unreadableStarts = 0;
}

function remember(sessionId: string, startedAt: number | null): void {
  if (sessionStarts.size >= SESSION_START_CACHE_LIMIT) {
    const oldest = sessionStarts.keys().next().value;
    if (oldest !== undefined) sessionStarts.delete(oldest);
  }
  sessionStarts.set(sessionId, startedAt);
}

// Null means the start is unknown, not young: the caller lets an unknown through rather than
// sign everybody out when the provider is having a bad minute.
export async function sessionStartedAt(
  identity: SessionAgeOperations,
  sessionId: string,
  userId: string,
): Promise<number | null> {
  const cached = sessionStarts.get(sessionId);
  if (cached !== undefined) return cached;

  let startedAt: number | null = null;
  try {
    const session = await identity.getSession(sessionId);
    startedAt = session && session.userId === userId ? session.createdAt : null;
  } catch (error) {
    logger.warn({ error, userId }, '[session-age] session start unreadable; age not measured');
  }

  // Cached either way, so an unreadable start costs one lookup and one log line
  // per session rather than one of each per request.
  remember(sessionId, startedAt);
  if (startedAt === null) unreadableStarts += 1;
  return startedAt;
}

export async function isSessionPastAbsoluteLifetime(
  identity: SessionAgeOperations,
  sessionId: string,
  userId: string,
  now: number,
): Promise<boolean> {
  return hasOutlivedAbsoluteLifetime(await sessionStartedAt(identity, sessionId, userId), now);
}

// Ended at the provider so the next request is refused before it reaches here.
export async function endSessionPastAbsoluteLifetime(
  identity: SessionAgeOperations,
  sessionId: string,
  userId: string,
): Promise<void> {
  try {
    await identity.revokeSession(sessionId);
  } catch (error) {
    logger.warn({ error, userId }, '[session-age] session past its lifetime could not be revoked');
  }
}
