import 'server-only';

import { auth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';

import { getClerkAuthorizedParties } from '@/lib/clerk-authorized-parties';
import { createError } from '@/lib/errors';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';

export interface SessionsPrincipal extends UserScopedDb {
  currentSessionId: string | null;
}

async function clerkSessionIdFromBearer(token: string, userId: string): Promise<string | null> {
  if (token.startsWith('sk_live_') || token.startsWith('sk_test_')) return null;

  const secretKey = process.env['CLERK_SECRET_KEY'];
  if (!secretKey) return null;

  try {
    const { verifyToken } = await import('@clerk/backend');
    const claims = await verifyToken(token, {
      secretKey,
      authorizedParties: getClerkAuthorizedParties(),
    });
    if (claims.sub !== userId) return null;
    const sid = (claims as Record<string, unknown>)['sid'];
    return typeof sid === 'string' && sid.length > 0 ? sid : null;
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
      currentSessionId: await clerkSessionIdFromBearer(authHeader.slice(7), scoped.userId),
    };
  }

  const { sessionId } = await auth();
  if (!sessionId) {
    throw createError.unauthorized('Authentication required');
  }
  return { ...scoped, currentSessionId: sessionId };
}
