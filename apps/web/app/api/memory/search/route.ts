/**
 * Memory Search API
 *
 * GET /api/memory/search?q=search+terms - Search user memories by content
 */

import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { User } from '@supabase/supabase-js';

async function getAuthenticatedUser(request: NextRequest): Promise<User> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, flowType: 'pkce' },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw createError.unauthorized('Invalid token');
    }
    return data.user;
  }

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
          // ignore
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // ignore
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

async function handleSearchMemories(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();

  if (!query || query.length === 0) {
    throw createError.validation('Search query is required');
  }

  if (query.length > 500) {
    throw createError.validation('Search query must be 500 characters or less');
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Escape LIKE wildcards to prevent wildcard injection
  const escapedQuery = query.replace(/[%_\\]/g, '\\$&');

  // Simple ILIKE text search — can be upgraded to vector similarity later
  const { data, error } = await supabase
    .from('user_memories')
    .select('id, content, category, source, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .ilike('content', `%${escapedQuery}%`)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to search memories');
    throw createError.internal('Failed to search memories');
  }

  return NextResponse.json({
    memories: (data || []).map((m) => ({
      id: m.id,
      content: m.content,
      category: m.category,
      source: m.source,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    })),
    query,
  });
}

export const GET = withErrorHandler(handleSearchMemories);
