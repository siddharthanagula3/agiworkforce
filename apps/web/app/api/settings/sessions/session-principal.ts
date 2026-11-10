import 'server-only';

import type { NextRequest } from 'next/server';

import { createError } from '@/lib/errors';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { getRequestIdentity } from '@/lib/server/identity';
import { verifyRequestSessionToken } from '@/lib/server/native-session-token';

export interface SessionsPrincipal extends UserScopedDb {
  currentSessionId: string | null;
}

async function sessionIdFromBearer(
  request: NextRequest,
  token: string,
  userId: string,
): Promise<string | null> {
  if (token.startsWith('sk_live_') || token.startsWith('sk_test_')) return null;

  try {
    const claims = await verifyRequestSessionToken(request, token);
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
      currentSessionId: await sessionIdFromBearer(request, authHeader.slice(7), scoped.userId),
    };
  }

  const { sessionId } = await getRequestIdentity();
  if (!sessionId) {
    throw createError.unauthorized('Authentication required');
  }
  return { ...scoped, currentSessionId: sessionId };
}
