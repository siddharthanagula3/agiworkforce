/**
 * Support Tickets (authenticated path).
 *
 * POST /api/support/tickets — create a support ticket (auth required).
 *
 * The existing POST /api/support route also creates tickets (used by
 * support-service.ts submitTicket()). This route provides a named path
 * at /api/support/tickets for clients that prefer the explicit URL.
 * Both routes share the same support_tickets table.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

const CreateTicketSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(500),
  subject: z.string().min(1).max(500),
  message: z.string().min(1).max(10000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
});

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

async function handlePost(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const parsed = CreateTicketSchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Invalid request body', parsed.error);

  const { name, email, subject, message, priority } = parsed.data;

  const [row] = await db.query<TicketRow>(
    `
      insert into support_tickets
        (user_id, name, email, subject, message, status, priority, created_at, updated_at)
      values ($1, $2, $3, $4, $5, 'open', $6, now(), now())
      returning id, user_id, name, email, subject, message,
                status, priority, created_at, updated_at, resolved_at
    `,
    [userId, name, email, subject, message, priority],
  );

  return NextResponse.json({ ticket: row }, { status: 201 });
}

export const POST = withErrorHandler(handlePost);
