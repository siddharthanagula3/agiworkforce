import 'server-only';

import { auth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';

import { getClerkAuthUser } from '@/lib/api-auth';
import { createError } from '@/lib/errors';

export interface SessionsPrincipal {
  userId: string;
  currentSessionId: string | null;
}

function clerkAuthorizedParties(): string[] {
  return (process.env['CLERK_AUTHORIZED_PARTIES'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function clerkSessionIdFromBearer(token: string, userId: string): Promise<string | null> {
  if (token.startsWith('sk_live_') || token.startsWith('sk_test_')) return null;

  const secretKey = process.env['CLERK_SECRET_KEY'];
  if (!secretKey) return null;

  try {
    const { verifyToken } = await import('@clerk/backend');
    const authorizedParties = clerkAuthorizedParties();
    const claims = await verifyToken(token, {
      secretKey,
      ...(authorizedParties.length > 0 ? { authorizedParties } : {}),
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

  const { userId } = await getClerkAuthUser(request);

  if (authHeader?.startsWith('Bearer ')) {
    return {
      userId,
      currentSessionId: await clerkSessionIdFromBearer(authHeader.slice(7), userId),
    };
  }

  const { sessionId } = await auth();
  if (!sessionId) {
    throw createError.unauthorized('Authentication required');
  }
  return { userId, currentSessionId: sessionId };
}
