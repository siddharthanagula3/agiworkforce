/**
 * Single Conversation API
 *
 * GET /api/chat/conversations/[id] - Get conversation with messages
 * PUT /api/chat/conversations/[id] - Update conversation (rename)
 * DELETE /api/chat/conversations/[id] - Soft delete conversation
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
import { UpdateConversationSchema } from '@/lib/validations/chat';
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

  // Use getUser() (not getSession()) so the JWT is re-validated against Supabase
  // on every server-side request. getSession() trusts the cookie without revalidation.
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

async function handleGetConversation(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id } = await context.params;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get conversation
  const { data: conversation, error: convError } = await supabase
    .from('web_conversations')
    .select('id, title, model, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (convError || !conversation) {
    throw createError.notFound('Conversation not found');
  }

  // Get messages
  const { data: messages, error: msgError } = await supabase
    .from('web_messages')
    .select(
      'id, role, content, model, provider, input_tokens, output_tokens, cost_cents, created_at',
    )
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  if (msgError) {
    logger.error({ error: msgError, conversationId: id }, 'Failed to fetch messages');
    throw createError.internal('Failed to fetch messages');
  }

  return NextResponse.json({
    conversation,
    messages: messages || [],
  });
}

async function handleUpdateConversation(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  // AUDIT-008-002: Validate input with Zod schema (title max 500 chars, model enum)
  const validationResult = UpdateConversationSchema.safeParse(rawBody);
  if (!validationResult.success) {
    throw createError.validation('Invalid request body', validationResult.error);
  }
  const body = validationResult.data;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const updates: Record<string, unknown> = {};
  if (body['title']) updates['title'] = body['title'];
  if (body['model']) updates['model'] = body['model'];

  const { data, error } = await supabase
    .from('web_conversations')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error || !data) {
    throw createError.notFound('Conversation not found');
  }

  return NextResponse.json({ conversation: data });
}

async function handleDeleteConversation(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id } = await context.params;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Soft delete
  const { error } = await supabase
    .from('web_conversations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null);

  if (error) {
    logger.error({ error, conversationId: id }, 'Failed to delete conversation');
    throw createError.internal('Failed to delete conversation');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetConversation);
export const PUT = withErrorHandler(handleUpdateConversation);
export const DELETE = withErrorHandler(handleDeleteConversation);
