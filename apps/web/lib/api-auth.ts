import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { requireEnv } from '@/utils/env';
import { createError } from '@/lib/errors';
import type { User } from '@supabase/supabase-js';

/**
 * Authenticate a user from a Next.js API route request.
 *
 * Supports two auth flows:
 * 1. Bearer token (Authorization header) — verified server-side using the service role key
 * 2. Cookie-based session (Supabase SSR) — for browser requests
 *
 * @throws {AppError} 401 Unauthorized if no valid auth is found
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<User> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');

  // Path 1: Bearer token auth (desktop app, CLI, API clients)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Use service role key for server-side JWT verification — anon key cannot verify
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
          // Route Handler context — cookie writes may throw in read-only contexts
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // Route Handler context — cookie writes may throw in read-only contexts
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
