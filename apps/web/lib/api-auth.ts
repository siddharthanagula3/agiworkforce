import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { requireEnv } from '@/utils/env';
import { createError } from '@/lib/errors';
import type { User } from '@supabase/supabase-js';
import { getUserClient, getServiceClient } from '@/lib/supabase-server';
import { auth } from '@clerk/nextjs/server';
import { resolveClerkId } from '@/lib/server/user-id-resolver';
import { logger } from '@/lib/logger';

export interface AuthResult {
  userId: string;
  email?: string;
}

/**
 * Authenticate a user from a Next.js API route request.
 *
 * Supports two auth flows:
 * 1. Bearer token (Authorization header) - verified server-side using the service role key
 * 2. Cookie-based session (Supabase SSR) - for browser requests
 *
 * @throws {AppError} 401 Unauthorized if no valid auth is found
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<User> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');

  // Path 1: Bearer token auth (desktop app, CLI, API clients)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Use service role key for server-side JWT verification - anon key cannot verify
    // tokens server-side since it lacks the JWT secret needed to validate signatures.
    const supabase = createClient(supabaseUrl, requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw createError.unauthorized('Invalid token');
    }
    return data.user;
  }

  // Path 2: Cookie-based SSR auth (browser requests)
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    auth: { flowType: 'pkce' },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Route Handler context - cookie writes may throw in read-only contexts
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // Route Handler context - cookie writes may throw in read-only contexts
        }
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw createError.unauthorized();
  }
  return user;
}

/**
 * Authenticate a user and return both the user and an RLS-bound Supabase client.
 *
 * For Bearer token requests: verifies the JWT and returns a getUserClient(token)
 * so all downstream DB operations are RLS-enforced by the user's identity.
 *
 * For cookie-based requests: returns the SSR server client which is already
 * scoped to the authenticated session (RLS enforced via anon key + session).
 *
 * Use this in any route that needs to perform user-scoped DB operations.
 * The returned userDb replaces direct createClient(url, serviceKey) calls.
 *
 * @throws {AppError} 401 Unauthorized if no valid auth is found
 */
export async function getAuthenticatedUserWithClient(
  request: NextRequest,
): Promise<{ user: User; userDb: SupabaseClient }> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');

  // Path 1: Bearer token auth (desktop app, CLI, API clients)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Verify token via service-role client (needed for JWT validation).
    // ONLY use this client for auth.getUser — never for DB ops.
    const verifier = getServiceClient();
    const { data, error } = await verifier.auth.getUser(token);
    if (error || !data.user) {
      throw createError.unauthorized('Invalid token');
    }
    // Return RLS-bound client for all subsequent DB operations.
    return { user: data.user, userDb: getUserClient(token) };
  }

  // Path 2: Cookie-based SSR auth (browser requests)
  // The SSR client is already RLS-bound via the anon key + session cookies.
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    auth: { flowType: 'pkce' },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Route Handler context
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // Route Handler context
        }
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw createError.unauthorized();
  }
  // The SSR client already enforces RLS via the session.
  return { user, userDb: supabase };
}

// ============================================================================
// Clerk-based auth (Phase 1B of Supabase → Clerk+Neon migration)
//
// New routes should use these functions. Existing routes will be migrated
// in Phase 2 waves. The Supabase functions above are kept for backwards
// compatibility during the transition.
// ============================================================================

async function verifyBearerToken(token: string): Promise<AuthResult | null> {
  // Try Clerk token verification first
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
    // Not a Clerk token — try Supabase fallback
  }

  // Supabase fallback (transition period for desktop/CLI/mobile)
  try {
    const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (supabaseUrl && serviceKey) {
      const supabase = getServiceClient();
      const { data } = await supabase.auth.getUser(token);
      if (data?.user) {
        const clerkId = await resolveClerkId(data.user.id);
        if (clerkId) {
          return { userId: clerkId, email: data.user.email ?? undefined };
        }
        logger.warn(
          { supabaseUuid: data.user.id },
          'Bearer token valid in Supabase but no Clerk mapping found — user must re-authenticate via Clerk',
        );
      }
    }
  } catch {
    // Supabase verification failed
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
