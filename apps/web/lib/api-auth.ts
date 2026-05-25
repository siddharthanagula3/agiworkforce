import 'server-only';

import type { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';
import { auth } from '@clerk/nextjs/server';

export interface AuthResult {
  userId: string;
  email?: string;
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
    return { userId };
  }

  // Path 2: Bearer token (desktop/CLI/mobile)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const result = await verifyBearerToken(token);
    if (result) return result;
  }

  throw createError.unauthorized();
}
