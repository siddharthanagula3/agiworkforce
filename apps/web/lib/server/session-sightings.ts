import 'server-only';

import { after } from 'next/server';

import { sessionStartedAt } from '@/lib/auth/session-age';
import { sessionAbsoluteLifetimeMs } from '@/lib/auth/session-policy';
import { logger } from '@/lib/logger';
import { getIdentityProvider } from '@/lib/server/identity';
import { getKeyValueStore } from '@/lib/server/key-value';
import { getNeonDb } from '@/lib/server/neon-db';

const SEEN_KEY_PREFIX = 'session-seen';
const MAX_REMEMBERED_SESSIONS = 5_000;
const NEW_SESSION_WINDOW_MS = 15 * 60 * 1000;

const rememberedSessions = new Set<string>();

function remember(key: string): void {
  if (rememberedSessions.size >= MAX_REMEMBERED_SESSIONS) rememberedSessions.clear();
  rememberedSessions.add(key);
}

async function announceIfFirstSighting(
  userId: string,
  subject: string,
  sessionId: string,
  request: Request | undefined,
): Promise<boolean> {
  const startedAt = await sessionStartedAt(getIdentityProvider(), sessionId, subject);
  if (startedAt === null) return false;
  if (Date.now() - startedAt > NEW_SESSION_WINDOW_MS) return true;
  const store = getKeyValueStore();
  if (!store) return false;
  const first = await store.set(`${SEEN_KEY_PREFIX}:${sessionId}`, userId, {
    ttlSeconds: Math.ceil(sessionAbsoluteLifetimeMs() / 1000),
    onlyIfAbsent: true,
  });
  if (!first) return true;
  const { emitIdentitySecurityEvent } = await import('@/lib/services/identity-events');
  await emitIdentitySecurityEvent(getNeonDb(), {
    userId,
    event: 'new_sign_in',
    subjectRef: sessionId,
    request,
  });
  return true;
}

export function noteSessionSighting(
  userId: string,
  subject: string,
  sessionId: string | null,
  request: Request | undefined,
): void {
  if (!sessionId) return;
  const key = JSON.stringify([userId, subject, sessionId]);
  if (rememberedSessions.has(key)) return;
  remember(key);
  const task = announceIfFirstSighting(userId, subject, sessionId, request)
    .then((completed) => {
      if (!completed) rememberedSessions.delete(key);
    })
    .catch((error: unknown) => {
      rememberedSessions.delete(key);
      logger.warn({ error, userId }, '[session-sightings] new sign-in notice failed');
    });
  try {
    after(task);
  } catch {
    void task;
  }
}
