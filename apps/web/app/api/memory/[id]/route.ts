/**
 * Single Memory API
 *
 * GET /api/memory/[id] - Get a single memory by ID
 * PUT /api/memory/[id] - Update memory content
 * DELETE /api/memory/[id] - Soft delete a memory
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
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw createError.unauthorized();
  }
  return user;
}

type RouteContext = { params: Promise<{ id: string }> };

async function handleGetMemory(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id } = await context.params;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('user_memories')
    .select('id, content, category, source, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  if (error || !data) {
    throw createError.notFound('Memory not found');
  }

  return NextResponse.json({
    memory: {
      id: data.id,
      content: data.content,
      category: data.category,
      source: data.source,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

async function handleUpdateMemory(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id } = await context.params;

  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
    throw createError.validation('Content is required');
  }

  if (body.content.length > 10_000) {
    throw createError.validation('Content must be 10,000 characters or less');
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('user_memories')
    .update({
      content: body.content.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .select()
    .single();

  if (error || !data) {
    throw createError.notFound('Memory not found');
  }

  return NextResponse.json({
    memory: {
      id: data.id,
      content: data.content,
      category: data.category,
      source: data.source,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

async function handleDeleteMemory(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id } = await context.params;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { error } = await supabase
    .from('user_memories')
    .update({
      is_deleted: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_deleted', false);

  if (error) {
    logger.error({ error, memoryId: id }, 'Failed to delete memory');
    throw createError.internal('Failed to delete memory');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetMemory);
export const PUT = withErrorHandler(handleUpdateMemory);
export const DELETE = withErrorHandler(handleDeleteMemory);
