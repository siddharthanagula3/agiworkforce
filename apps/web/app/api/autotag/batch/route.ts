/**
 * Autotag Batch API
 *
 * POST /api/autotag/batch - Get tags for multiple conversations
 *
 * Looks up existing tags from conversation_tags table.
 * Returns 'general' for any conversation without a stored tag.
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

async function handleBatchGetTags(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

  let body: { conversationIds?: string[] };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON body');
  }

  const { conversationIds } = body;
  if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
    throw createError.validation('conversationIds must be a non-empty array');
  }

  // Cap at 100 to prevent abuse
  if (conversationIds.length > 100) {
    throw createError.validation('Maximum 100 conversation IDs per request');
  }

  // Validate all IDs are strings
  if (!conversationIds.every((id) => typeof id === 'string' && id.length > 0)) {
    throw createError.validation('All conversationIds must be non-empty strings');
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch existing tags for this user's conversations
  const { data, error } = await supabase
    .from('conversation_tags')
    .select('conversation_id, tag')
    .eq('user_id', user.id)
    .in('conversation_id', conversationIds);

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to fetch batch tags');
    throw createError.internal('Failed to fetch tags');
  }

  // Build result map, defaulting to 'general' for untagged conversations
  const tags: Record<string, string> = {};
  for (const id of conversationIds) {
    tags[id] = 'general';
  }
  for (const row of data ?? []) {
    tags[row.conversation_id] = row.tag;
  }

  return NextResponse.json({ tags });
}

export const POST = withErrorHandler(handleBatchGetTags);
