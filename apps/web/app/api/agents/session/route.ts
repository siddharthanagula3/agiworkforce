import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

/**
 * POST /api/agents/session
 * Create or manage an agent chat session.
 */
async function handler(request: NextRequest) {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  // Authenticate user
  const authHeader = request.headers.get('authorization');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let userId: string;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw createError.unauthorized('Invalid or expired token');
    }
    userId = user.id;
  } else {
    const { createServerClient } = await import('@supabase/ssr');
    const ssrClient = createServerClient(supabaseUrl, requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // Read-only for this route
        },
      },
    });
    const {
      data: { user },
      error,
    } = await ssrClient.auth.getUser();
    if (error || !user) {
      throw createError.unauthorized('Authentication required');
    }
    userId = user.id;
  }

  const body = await request.json();
  const { action, sessionId, employeeId, title } = body;

  switch (action) {
    case 'create': {
      const { data, error } = await supabase
        .from('web_conversations')
        .insert({
          user_id: userId,
          title: title || 'New Chat',
          employee_id: employeeId || 'general',
        })
        .select()
        .single();

      if (error) {
        logger.error({ userId, error }, 'Failed to create session');
        throw createError.internal('Failed to create chat session');
      }

      return NextResponse.json({ session: data });
    }

    case 'list': {
      const { data, error } = await supabase
        .from('web_conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) {
        logger.error({ userId, error }, 'Failed to list sessions');
        throw createError.internal('Failed to list sessions');
      }

      return NextResponse.json({ sessions: data });
    }

    case 'get': {
      if (!sessionId) {
        throw createError.badRequest('sessionId is required');
      }

      const { data: session, error: sessionError } = await supabase
        .from('web_conversations')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

      if (sessionError || !session) {
        throw createError.notFound('Session not found');
      }

      const { data: messages, error: messagesError } = await supabase
        .from('web_messages')
        .select('*')
        .eq('conversation_id', sessionId)
        .order('created_at', { ascending: true });

      if (messagesError) {
        logger.error({ sessionId, error: messagesError }, 'Failed to get messages');
        throw createError.internal('Failed to get messages');
      }

      return NextResponse.json({ session, messages });
    }

    case 'delete': {
      if (!sessionId) {
        throw createError.badRequest('sessionId is required');
      }

      const { error } = await supabase
        .from('web_conversations')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', userId);

      if (error) {
        logger.error({ sessionId, error }, 'Failed to delete session');
        throw createError.internal('Failed to delete session');
      }

      return NextResponse.json({ success: true });
    }

    default:
      throw createError.badRequest(`Unknown action: ${action}`);
  }
}

export const POST = withErrorHandler(withRateLimitHandler(handler, 'chat-conversation'));
