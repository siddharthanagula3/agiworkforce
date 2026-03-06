/**
 * Autotag Conversations API
 *
 * GET /api/autotag/conversations?tag=coding - Get conversation IDs by tag
 *
 * Returns all conversation IDs for the authenticated user that match
 * the specified tag from the conversation_tags table.
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

const VALID_TAGS = [
  'coding',
  'research',
  'writing',
  'brainstorm',
  'analysis',
  'debug',
  'creative',
  'general',
] as const;

async function getAuthenticatedUser(request: NextRequest): Promise<User> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');

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

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
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

async function handleGetConversationsByTag(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

  // Parse and validate the tag query parameter
  const { searchParams } = new URL(request.url);
  const tag = searchParams.get('tag');

  if (!tag) {
    throw createError.validation('tag query parameter is required');
  }

  if (!VALID_TAGS.includes(tag as (typeof VALID_TAGS)[number])) {
    throw createError.validation(`Invalid tag. Must be one of: ${VALID_TAGS.join(', ')}`);
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('conversation_tags')
    .select('conversation_id')
    .eq('user_id', user.id)
    .eq('tag', tag)
    .order('classified_at', { ascending: false })
    .limit(200);

  if (error) {
    logger.error({ error, userId: user.id, tag }, 'Failed to fetch conversations by tag');
    throw createError.internal('Failed to fetch conversations');
  }

  const conversationIds = (data ?? []).map((row) => row.conversation_id);

  return NextResponse.json({ conversationIds });
}

export const GET = withErrorHandler(handleGetConversationsByTag);
