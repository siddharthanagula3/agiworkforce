import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

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
      let rows: Record<string, unknown>[];
      try {
        rows = await db.query<Record<string, unknown>>(
          `insert into web_conversations (user_id, title, employee_id)
           values ($1, $2, $3)
           returning *`,
          [userId, title || 'New Chat', employeeId || 'general'],
        );
      } catch (err) {
        logger.error({ userId, err }, 'Failed to create session');
        throw createError.internal('Failed to create chat session');
      }

      return NextResponse.json({ session: rows[0] ?? null });
    }

    case 'list': {
      let rows: Record<string, unknown>[];
      try {
        rows = await db.query<Record<string, unknown>>(
          `select *
           from web_conversations
           where user_id = $1
           order by updated_at desc
           limit 50`,
          [userId],
        );
      } catch (err) {
        logger.error({ userId, err }, 'Failed to list sessions');
        throw createError.internal('Failed to list sessions');
      }

      return NextResponse.json({ sessions: rows });
    }

    case 'get': {
      if (!sessionId) {
        throw createError.badRequest('sessionId is required');
      }

      const sessionRows = await db.query<Record<string, unknown>>(
        `select *
         from web_conversations
         where id = $1 and user_id = $2`,
        [sessionId, userId],
      );

      if (sessionRows.length === 0) {
        throw createError.notFound('Session not found');
      }

      let msgRows: Record<string, unknown>[];
      try {
        msgRows = await db.query<Record<string, unknown>>(
          `select *
           from web_messages
           where conversation_id = $1
           order by created_at asc`,
          [sessionId],
        );
      } catch (err) {
        logger.error({ sessionId, err }, 'Failed to get messages');
        throw createError.internal('Failed to get messages');
      }

      return NextResponse.json({ session: sessionRows[0], messages: msgRows });
    }

    case 'delete': {
      if (!sessionId) {
        throw createError.badRequest('sessionId is required');
      }

      try {
        await db.execute(
          `delete from web_conversations
           where id = $1 and user_id = $2`,
          [sessionId, userId],
        );
      } catch (err) {
        logger.error({ sessionId, err }, 'Failed to delete session');
        throw createError.internal('Failed to delete session');
      }

      return NextResponse.json({ success: true });
    }

    default:
      throw createError.badRequest(`Unknown action: ${action}`);
  }
}

export const POST = withErrorHandler(withRateLimitHandler(handler, 'chat-conversation'));
