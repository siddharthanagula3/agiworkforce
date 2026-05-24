import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';

const SubmitTicketSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(500),
  subject: z.string().min(1).max(500),
  message: z.string().min(1).max(10000),
});

type TicketRow = {
  id: string;
  user_id: string | null;
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

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const rows = await db.query<TicketRow>(
    `select id, user_id, name, email, subject, message, status, priority,
            created_at, updated_at, resolved_at
     from support_tickets
     where user_id = $1
     order by created_at desc`,
    [userId],
  );

  return NextResponse.json({ tickets: rows });
}

async function handlePost(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  // Stricter rate limit for ticket submission to prevent spam
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  // Support ticket submission is allowed for unauthenticated users (contact form),
  // but we attempt to associate with user if authenticated.
  let userId: string | null = null;
  try {
    const auth = await getClerkAuthUser(request);
    userId = auth.userId;
  } catch {
    // Not authenticated - allow anonymous ticket submission
  }

  const db = getNeonDb();

  const body = await request.json();
  const parsed = SubmitTicketSchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Invalid request body');

  const { name, email, subject, message } = parsed.data;

  const [row] = await db.query<TicketRow>(
    `insert into support_tickets
       (user_id, name, email, subject, message, status, priority, created_at, updated_at)
     values ($1, $2, $3, $4, $5, 'open', 'normal', now(), now())
     returning id, user_id, name, email, subject, message, status, priority,
               created_at, updated_at, resolved_at`,
    [userId, name, email, subject, message],
  );

  return NextResponse.json({ ticket: row }, { status: 201 });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
