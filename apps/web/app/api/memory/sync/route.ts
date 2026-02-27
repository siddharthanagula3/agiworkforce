/**
 * Memory Sync API
 *
 * GET /api/memory/sync - Get sync status (last sync time, entry counts by source)
 * POST /api/memory/sync - Trigger a sync (returns count and last update time)
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

async function handleGetSyncStatus(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get total count and last updated timestamp
  const { data: allMemories, error } = await supabase
    .from('user_memories')
    .select('source, updated_at')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .order('updated_at', { ascending: false });

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to get sync status');
    throw createError.internal('Failed to get sync status');
  }

  const memories = allMemories || [];
  const lastSync = memories.length > 0 ? memories[0].updated_at : null;

  // Count by source
  const sources: Record<string, number> = { mobile: 0, desktop: 0, web: 0, auto: 0 };
  for (const m of memories) {
    const src = m.source ?? 'web';
    if (src in sources) {
      sources[src]++;
    }
  }

  return NextResponse.json({
    lastSync,
    entriesCount: memories.length,
    sources,
  });
}

async function handleTriggerSync(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // For now, sync is a simple count + last-update query.
  // In the future this can trigger cross-device reconciliation.
  const { count, error } = await supabase
    .from('user_memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_deleted', false);

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to trigger sync');
    throw createError.internal('Failed to trigger sync');
  }

  return NextResponse.json({
    synced: count ?? 0,
    conflicts: 0,
  });
}

export const GET = withErrorHandler(handleGetSyncStatus);
export const POST = withErrorHandler(handleTriggerSync);
