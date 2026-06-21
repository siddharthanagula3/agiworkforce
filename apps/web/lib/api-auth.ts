import 'server-only';

import type { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { auth } from '@clerk/nextjs/server';

export interface AuthResult {
  userId: string;
  email?: string;
}

/**
 * Enforce admin suspension/ban: the admin "suspend-user" action writes
 * profiles.account_status, but until now nothing READ it, so suspended users kept
 * full access. Reject suspended/banned accounts here. Fails OPEN on a lookup error
 * (a DB hiccup must not lock every user out), but a known 'suspended'/'banned'
 * status is always rejected.
 */
export async function assertAccountActive(userId: string): Promise<void> {
  let status: string | null | undefined;
  try {
    const { getNeonDb } = await import('@/lib/server/neon-db');
    const rows = await getNeonDb().query<{ account_status: string | null }>(
      'select account_status from profiles where id = $1 limit 1',
      [userId],
    );
    status = rows[0]?.account_status;
  } catch (lookupError) {
    logger.warn({ error: lookupError, userId }, 'account_status lookup failed; allowing request');
    return;
  }
  if (status === 'suspended' || status === 'banned') {
    throw createError.forbidden('Your account has been suspended. Please contact support.');
  }
}

async function verifyBearerToken(token: string): Promise<AuthResult | null> {
  try {
    const { verifyToken } = await import('@clerk/backend');
    const secretKey = process.env['CLERK_SECRET_KEY'];
    if (secretKey) {
      const claims = await verifyToken(token, { secretKey });
      const sub = claims.sub;
      if (typeof sub === 'string' && sub.length > 0) {
        return {
          userId: sub,
          email: (claims as Record<string, unknown>)['email'] as string | undefined,
        };
      }
    }
  } catch {
    // Not a valid Clerk token
  }

  return null;
}

export async function getClerkAuthUser(request: NextRequest): Promise<AuthResult> {
  // Path 1: Clerk session (browser requests via middleware)
  const { userId } = await auth();
  if (userId) {
    await assertAccountActive(userId);
    return { userId };
  }

  // Path 2: Bearer token (desktop/CLI/mobile)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const result = await verifyBearerToken(token);
    if (result) {
      await assertAccountActive(result.userId);
      return result;
    }
  }

  throw createError.unauthorized();
}
