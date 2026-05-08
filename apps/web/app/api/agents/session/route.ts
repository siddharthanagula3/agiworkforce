import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';

// Zod schema for session actions
const SessionRequestSchema = z.object({
  action: z.enum(['create', 'list', 'get', 'delete']),
  sessionId: z.string().uuid().optional(),
  employeeId: z.string().max(100).optional(),
  title: z.string().max(500).optional(),
});

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

/**
 * POST /api/agents/session
 * Create or manage an agent chat session.
 */
async function handler(request: NextRequest) {
  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  // RLS-AUDIT-FIX: replaced inline service-role auth with user-scoped client.
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);
  const userId = user.id;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.badRequest('Invalid JSON in request body');
  }

  const validationResult = SessionRequestSchema.safeParse(rawBody);
  if (!validationResult.success) {
    throw createError.badRequest(
      'Invalid request body: ' + validationResult.error.issues.map((i) => i.message).join(', '),
    );
  }

  const { action, sessionId, employeeId, title } = validationResult.data;

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
