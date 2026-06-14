/**
 * GET /api/support/[id] · get a support ticket by ID.
 * Returns ticket details. Auth required; user may only access their own tickets.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

type RouteContext = { params: Promise<{ id: string }> };

type TicketRow = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

async function handleGetTicket(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const { id } = await context.params;

  const db = getNeonDb();
  const [ticket] = await db.query<TicketRow>(
    `
      select id, user_id, name, email, subject, message,
             status, priority, created_at, updated_at, resolved_at
      from support_tickets
      where id = $1 and user_id = $2
      limit 1
    `,
    [id, userId],
  );

  if (!ticket) throw createError.notFound('Ticket not found');

  return NextResponse.json({ ticket });
}

export const GET = withErrorHandler(handleGetTicket);
