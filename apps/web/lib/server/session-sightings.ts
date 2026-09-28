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

function remember(sessionId: string): void {
  if (rememberedSessions.size >= MAX_REMEMBERED_SESSIONS) rememberedSessions.clear();
  rememberedSessions.add(sessionId);
}

async function announceIfFirstSighting(
  userId: string,
  sessionId: string,
  request: Request | undefined,
): Promise<void> {
  const startedAt = await sessionStartedAt(getIdentityProvider(), sessionId, userId);
  if (startedAt === null || Date.now() - startedAt > NEW_SESSION_WINDOW_MS) return;
  const store = getKeyValueStore();
  if (!store) return;
  const first = await store.set(`${SEEN_KEY_PREFIX}:${sessionId}`, userId, {
    ttlSeconds: Math.ceil(sessionAbsoluteLifetimeMs() / 1000),
    onlyIfAbsent: true,
  });
  if (!first) return;
  const { emitIdentitySecurityEvent } = await import('@/lib/services/identity-events');
  await emitIdentitySecurityEvent(getNeonDb(), {
    userId,
    event: 'new_sign_in',
    subjectRef: sessionId,
    request,
  });
}

export function noteSessionSighting(
  userId: string,
  sessionId: string | null,
  request: Request | undefined,
): void {
  if (!sessionId || rememberedSessions.has(sessionId)) return;
  remember(sessionId);
  const task = announceIfFirstSighting(userId, sessionId, request).catch((error: unknown) => {
    rememberedSessions.delete(sessionId);
    logger.warn({ error, userId }, '[session-sightings] new sign-in notice failed');
  });
  try {
    after(task);
  } catch {
    void task;
  }
}
