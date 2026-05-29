/**
 * GET /api/support/[id]/replies — list replies on a support ticket.
 * Auth required; user may only access replies on their own tickets.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

type RouteContext = { params: Promise<{ id: string }> };

type ReplyRow = {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_staff: boolean;
  created_at: string;
};

async function handleGetReplies(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const { id: ticketId } = await context.params;

  const db = getNeonDb();

  // Verify ticket ownership before returning replies
  const [ticket] = await db.query<{ id: string }>(
    'select id from support_tickets where id = $1 and user_id = $2 limit 1',
    [ticketId, userId],
  );
  if (!ticket) throw createError.notFound('Ticket not found');

  const replies = await db.query<ReplyRow>(
    `
      select id, ticket_id, user_id, message, is_staff, created_at
      from support_ticket_replies
      where ticket_id = $1
      order by created_at asc
    `,
    [ticketId],
  );

  return NextResponse.json({ replies });
}

export const GET = withErrorHandler(handleGetReplies);
