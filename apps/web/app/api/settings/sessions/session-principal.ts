import 'server-only';

import type { NextRequest } from 'next/server';

import { createError } from '@/lib/errors';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { getRequestIdentity, verifyIdentitySessionToken } from '@/lib/server/identity';

export interface SessionsPrincipal extends UserScopedDb {
  currentSessionId: string | null;
}

async function sessionIdFromBearer(token: string, userId: string): Promise<string | null> {
  if (token.startsWith('sk_live_') || token.startsWith('sk_test_')) return null;

  try {
    const claims = await verifyIdentitySessionToken(token);
    if (!claims || claims.subject !== userId) return null;
    return claims.sessionId;
  } catch {
    return null;
  }
}

export async function resolveSessionsPrincipal(request: NextRequest): Promise<SessionsPrincipal> {
  const authHeader = request.headers.get('authorization');

  const scoped = await getUserScopedDb(request);

  if (authHeader?.startsWith('Bearer ')) {
    return {
      ...scoped,
      currentSessionId: await sessionIdFromBearer(authHeader.slice(7), scoped.userId),
    };
  }

  const { sessionId } = await getRequestIdentity();
  if (!sessionId) {
    throw createError.unauthorized('Authentication required');
  }
  return { ...scoped, currentSessionId: sessionId };
}
