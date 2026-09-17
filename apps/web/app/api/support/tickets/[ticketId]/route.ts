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
import {
  InvalidTicketTransitionError,
  MAX_TICKET_MESSAGE_CHARS,
  TicketClosedError,
  TicketNotFoundError,
  moveTicket,
  readTicket,
  replyToTicket,
} from '@/lib/support/tickets/service';
import { TICKET_STATUSES } from '@/lib/support/tickets/types';

export const runtime = 'nodejs';

const PatchSchema = z.union([
  z.object({ status: z.enum(TICKET_STATUSES) }).strict(),
  z.object({ reply: z.string().trim().min(1).max(MAX_TICKET_MESSAGE_CHARS) }).strict(),
]);

type RouteContext = { params: Promise<{ ticketId: string }> };

function translate(error: unknown): never {
  if (error instanceof TicketNotFoundError) {
    throw createError.notFound('No such ticket');
  }
  if (error instanceof TicketClosedError) {
    throw createError.validation(
      'This ticket is closed. Raise a new one and reference this ticket in it.',
    );
  }
  if (error instanceof InvalidTicketTransitionError) {
    throw createError.validation(error.message);
  }
  throw error;
}

async function handleRead(request: NextRequest, context: RouteContext) {
  const { userId } = await getClerkAuthUser(request);
  const { ticketId } = await context.params;

  const limited = await withRateLimit(request, 'support-tickets-read', `user:${userId}`);
  if (limited) return limited;

  try {
    const thread = await readTicket(ticketId, userId);
    logger.info({ userId, ticketId, replies: thread.replies.length }, '[support-ticket] read');
    return NextResponse.json(thread, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    translate(error);
  }
}

async function handlePatch(request: NextRequest, context: RouteContext) {
  const { userId } = await getClerkAuthUser(request);
  const { ticketId } = await context.params;

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-tickets-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = PatchSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Send either a status or a reply, not both', parsed.error);
  }

  try {
    if ('reply' in parsed.data) {
      const thread = await replyToTicket({
        ticketId,
        userId,
        message: parsed.data.reply,
      });
      return NextResponse.json(thread, { headers: { 'cache-control': 'no-store' } });
    }

    const ticket = await moveTicket({ ticketId, userId, to: parsed.data.status });
    return NextResponse.json({ ticket }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    translate(error);
  }
}

export const GET = withErrorHandler(handleRead);
export const PATCH = withErrorHandler(handlePatch);
