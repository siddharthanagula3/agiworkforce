import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { normalizeDiagnostics } from '@/lib/support/diagnostics/schema';
import { deployEnvironment, releaseSha } from '@/lib/server/hosting';
import {
  MAX_TICKET_MESSAGE_CHARS,
  MAX_TICKET_SUBJECT_CHARS,
  listTickets,
  openTicket,
} from '@/lib/support/tickets/service';

export const runtime = 'nodejs';

const CreateSchema = z.object({
  subject: z.string().trim().min(1).max(MAX_TICKET_SUBJECT_CHARS),
  message: z.string().trim().min(1).max(MAX_TICKET_MESSAGE_CHARS),
  handoffSessionId: z.string().uuid().optional(),
  diagnostics: z.unknown().optional(),
});

async function handleList(request: NextRequest) {
  const { userId } = await getClerkAuthUser(request);

  const limited = await withRateLimit(request, 'support-tickets-read', `user:${userId}`);
  if (limited) return limited;

  const tickets = await listTickets(userId);
  logger.info({ userId, count: tickets.length }, '[support-ticket] listed');

  return NextResponse.json({ tickets }, { headers: { 'cache-control': 'no-store' } });
}

async function handleCreate(request: NextRequest) {
  const { userId, email } = await getClerkAuthUser(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-tickets-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = CreateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid support ticket', parsed.error);
  }

  if (!email) {
    throw createError.validation('Add an email address to your account so support can reply.');
  }

  const ticket = await openTicket({
    userId,
    name: email,
    email,
    subject: parsed.data.subject,
    message: parsed.data.message,
    handoffSessionId: parsed.data.handoffSessionId ?? null,
    // Validated and re-redacted rather than trusted; a bundle that fails
    // validation is dropped, because losing the machine context must not lose
    // the ticket.
    diagnostics: normalizeDiagnostics(parsed.data.diagnostics, {
      releaseSha: releaseSha() ?? null,
      deployEnv: deployEnvironment() ?? null,
    }),
  });

  return NextResponse.json({ ticket }, { status: 201, headers: { 'cache-control': 'no-store' } });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);
